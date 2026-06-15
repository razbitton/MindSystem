import type { AppEnv } from "@personal-context-os/config";
import { agentTokens, users } from "@personal-context-os/db";
import type { LoginInput } from "@personal-context-os/shared";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { AppContext } from "./types.js";

export const sessionCookieName = "pcos_session";
export const sessionTtlSeconds = 60 * 60 * 24 * 7;

export interface PublicUser {
  id: string;
  workspaceId: string;
  email: string;
  displayName: string;
}

export interface RequestIdentity {
  kind: "user" | "agent";
  id: string;
  workspaceId: string;
  email?: string;
  displayName: string;
  scopes: string[];
}

interface SessionClaims {
  sub: string;
  workspaceId: string;
  email: string;
  displayName: string;
  iat: number;
  exp: number;
}

const scryptParams = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024
};

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${scryptParams.N}$${scryptParams.r}$${scryptParams.p}$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, passwordHash: string | null) {
  if (!passwordHash) return false;
  const [algorithm, n, r, p, salt, expectedKey] = passwordHash.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !salt || !expectedKey) return false;

  const key = await scryptAsync(password, salt, 64, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024
  });
  const expected = Buffer.from(expectedKey, "base64url");
  return expected.length === key.length && timingSafeEqual(expected, key);
}

export async function ensureBootstrapPassword(context: AppContext, password?: string) {
  if (!password || !context.userId) return;
  const [user] = await context.db.select().from(users).where(eq(users.id, context.userId)).limit(1);
  if (!user || user.passwordHash) return;
  await context.db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
}

export async function loginWithPassword(context: AppContext, input: LoginInput) {
  const [user] = await context.db
    .select()
    .from(users)
    .where(and(eq(users.workspaceId, context.workspaceId), sql`lower(${users.email}) = ${input.email.toLowerCase()}`))
    .limit(1);

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    return null;
  }

  await context.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  const publicUser = toPublicUser(user);
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);

  return {
    user: publicUser,
    token: signSession(publicUser, context.env.JWT_SECRET, expiresAt),
    expiresAt: expiresAt.toISOString()
  };
}

export async function authenticateSessionToken(context: AppContext, token: string | null) {
  if (!token) return null;
  const claims = verifySession(token, context.env.JWT_SECRET);
  if (!claims) return null;

  const [user] = await context.db
    .select()
    .from(users)
    .where(and(eq(users.id, claims.sub), eq(users.workspaceId, claims.workspaceId)))
    .limit(1);

  if (!user) return null;
  return {
    kind: "user",
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    displayName: user.displayName,
    scopes: ["admin"]
  } satisfies RequestIdentity;
}

export async function authenticateAgentBearer(context: AppContext, token: string | null) {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [agentToken] = await context.db
    .select()
    .from(agentTokens)
    .where(
      and(
        eq(agentTokens.tokenHash, tokenHash),
        isNull(agentTokens.revokedAt),
        or(isNull(agentTokens.expiresAt), gt(agentTokens.expiresAt, new Date()))
      )
    )
    .limit(1);

  if (!agentToken) return null;
  await context.db.update(agentTokens).set({ lastUsedAt: new Date() }).where(eq(agentTokens.id, agentToken.id));
  return {
    kind: "agent",
    id: agentToken.id,
    workspaceId: agentToken.workspaceId,
    displayName: agentToken.name,
    scopes: agentToken.scopes
  } satisfies RequestIdentity;
}

export function toPublicUser(user: typeof users.$inferSelect): PublicUser {
  return {
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    displayName: user.displayName
  };
}

export function signSession(user: PublicUser, secret: string, expiresAt: Date) {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    displayName: user.displayName,
    iat: now,
    exp: Math.floor(expiresAt.getTime() / 1000)
  };
  const header = base64UrlJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlJson(claims);
  const signature = sign(`${header}.${payload}`, secret);
  return `${header}.${payload}.${signature}`;
}

export function verifySession(token: string, secret: string): SessionClaims | null {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) return null;

  const expected = sign(`${header}.${payload}`, secret);
  const signatureBuffer = Buffer.from(signature, "base64url");
  const expectedBuffer = Buffer.from(expected, "base64url");
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<SessionClaims>;
    const now = Math.floor(Date.now() / 1000);
    if (!claims.sub || !claims.workspaceId || !claims.email || !claims.displayName || !claims.exp || claims.exp <= now) return null;
    return claims as SessionClaims;
  } catch {
    return null;
  }
}

export function readCookie(cookieHeader: string | undefined, name: string) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function readBearerToken(authorizationHeader: string | undefined) {
  return authorizationHeader?.startsWith("Bearer ") ? authorizationHeader.slice("Bearer ".length).trim() : null;
}

export function buildSessionCookie(env: AppEnv, value: string, maxAgeSeconds = sessionTtlSeconds) {
  const secure = env.APP_BASE_URL.startsWith("https://");
  const attributes = [
    `${sessionCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${maxAgeSeconds}`,
    `SameSite=${secure ? "None" : "Lax"}`
  ];
  if (secure) attributes.push("Secure");
  if (env.SESSION_COOKIE_DOMAIN) attributes.push(`Domain=${env.SESSION_COOKIE_DOMAIN}`);
  return attributes.join("; ");
}

export function buildExpiredSessionCookie(env: AppEnv) {
  return buildSessionCookie(env, "", 0);
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function scryptAsync(
  password: string,
  salt: string,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number } = scryptParams
) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}
