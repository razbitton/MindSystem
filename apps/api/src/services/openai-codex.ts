import type { AppEnv } from "@personal-context-os/config";
import { openaiCodexConnections } from "@personal-context-os/db";
import { and, eq } from "drizzle-orm";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { writeAuditEvent } from "./audit.js";
import type { Actor, AppContext } from "./types.js";

const openaiAuthBaseUrl = "https://auth.openai.com";
const openaiCodexClientId = "app_EMoamEEZ73f0CkXaXp7hrann";
const openaiCodexDeviceCallbackUrl = `${openaiAuthBaseUrl}/deviceauth/callback`;
const deviceCodeTimeoutMs = 15 * 60 * 1000;
const defaultPollIntervalMs = 5000;

type OpenAICodexConnection = typeof openaiCodexConnections.$inferSelect;

const startResponseSchema = z.object({
  device_auth_id: z.string().min(1),
  user_code: z.string().min(1).optional(),
  usercode: z.string().min(1).optional(),
  interval: z.coerce.number().positive().optional()
});

const pollInputSchema = z.object({
  deviceAuthId: z.string().min(1),
  userCode: z.string().min(1)
});

const pollResponseSchema = z.object({
  authorization_code: z.string().min(1),
  code_verifier: z.string().min(1)
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  token_type: z.string().optional(),
  scope: z.string().optional()
});

export async function getOpenAICodexStatus(context: AppContext) {
  const connection = await getConnection(context);
  const envToken = resolveEnvOpenAICodexToken(context.env);
  return {
    configured: hasOpenAICodexConfig(context.env) || Boolean(envToken),
    authMode: context.env.OPENAI_AUTH_MODE,
    connected: Boolean(connection || envToken),
    source: connection ? "stored_oauth" : envToken ? "env_access_token" : null,
    accountId: connection?.accountId ?? envToken?.accountId ?? null,
    email: connection?.email ?? null,
    chatgptPlanType: connection?.chatgptPlanType ?? null,
    expiryDate: connection?.expiryDate?.toISOString() ?? envToken?.expiresAt?.toISOString() ?? null
  };
}

export async function startOpenAICodexOAuth(context: AppContext) {
  assertUserContext(context);
  requireOpenAICodexConfig(context.env);

  const response = await fetch(`${openaiAuthBaseUrl}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: openAICodexHeaders("application/json"),
    body: JSON.stringify({ client_id: openaiCodexClientId })
  });
  const body = await readJsonResponse(response, "OpenAI Codex device code request failed");
  const parsed = startResponseSchema.parse(body);
  const userCode = parsed.user_code ?? parsed.usercode;
  if (!userCode) throw new Error("OpenAI Codex device code response did not include user_code.");

  return {
    verificationUrl: `${openaiAuthBaseUrl}/codex/device`,
    userCode,
    deviceAuthId: parsed.device_auth_id,
    intervalMs: Math.max(1000, Math.round((parsed.interval ?? defaultPollIntervalMs / 1000) * 1000)),
    expiresInMs: deviceCodeTimeoutMs
  };
}

export async function pollOpenAICodexOAuth(context: AppContext, input: unknown, actor: Actor) {
  assertUserContext(context);
  const config = requireOpenAICodexConfig(context.env);
  const parsed = pollInputSchema.parse(input ?? {});

  const response = await fetch(`${openaiAuthBaseUrl}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: openAICodexHeaders("application/json"),
    body: JSON.stringify({
      device_auth_id: parsed.deviceAuthId,
      user_code: parsed.userCode
    })
  });

  if (response.status === 403 || response.status === 404) {
    return { connected: false, pending: true };
  }

  const body = await readJsonResponse(response, "OpenAI Codex device authorization failed");
  const authorization = pollResponseSchema.parse(body);
  const tokens = await exchangeOpenAICodexAuthorizationCode(authorization.authorization_code, authorization.code_verifier);
  const identity = resolveOpenAICodexIdentity(tokens.access_token);
  if (!identity.accountId) throw new Error("OpenAI Codex access token did not include a ChatGPT account id.");

  const values = {
    workspaceId: context.workspaceId,
    userId: context.userId,
    accountId: identity.accountId,
    email: identity.email ?? null,
    chatgptPlanType: identity.chatgptPlanType ?? null,
    accessTokenCiphertext: encryptToken(tokens.access_token, config.encryptionKey),
    refreshTokenCiphertext: encryptToken(tokens.refresh_token, config.encryptionKey),
    expiryDate: resolveExpiresAt(tokens.expires_in),
    scope: scopeArray(tokens.scope),
    updatedAt: new Date()
  };

  const [connection] = await context.db
    .insert(openaiCodexConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [openaiCodexConnections.workspaceId],
      set: values
    })
    .returning({
      id: openaiCodexConnections.id,
      accountId: openaiCodexConnections.accountId,
      email: openaiCodexConnections.email,
      chatgptPlanType: openaiCodexConnections.chatgptPlanType,
      expiryDate: openaiCodexConnections.expiryDate
    });

  await writeAuditEvent(context, {
    ...actor,
    action: "openai codex connected",
    metadata: {
      accountId: identity.accountId,
      email: identity.email ?? null,
      chatgptPlanType: identity.chatgptPlanType ?? null
    }
  });

  return { connected: true, pending: false, connection };
}

export async function disconnectOpenAICodex(context: AppContext, actor: Actor) {
  assertUserContext(context);
  const [connection] = await context.db
    .delete(openaiCodexConnections)
    .where(and(eq(openaiCodexConnections.workspaceId, context.workspaceId), eq(openaiCodexConnections.userId, context.userId)))
    .returning({ id: openaiCodexConnections.id, accountId: openaiCodexConnections.accountId });

  if (connection) {
    await writeAuditEvent(context, {
      ...actor,
      action: "openai codex disconnected",
      metadata: { accountId: connection.accountId }
    });
  }

  return { ok: true };
}

export async function resolveOpenAICodexAccessToken(context: AppContext) {
  const envToken = resolveEnvOpenAICodexToken(context.env);
  if (envToken) {
    return { accessToken: envToken.accessToken, accountId: envToken.accountId };
  }

  const connection = await getConnection(context);
  if (!connection) return null;

  const config = requireOpenAICodexConfig(context.env);
  if (connection.expiryDate && connection.expiryDate.getTime() > Date.now() + 60_000) {
    return {
      accessToken: decryptToken(connection.accessTokenCiphertext, config.encryptionKey),
      accountId: connection.accountId
    };
  }

  const refreshed = await refreshOpenAICodexToken(decryptToken(connection.refreshTokenCiphertext, config.encryptionKey));
  const identity = resolveOpenAICodexIdentity(refreshed.access_token);
  const accountId = identity.accountId ?? connection.accountId;
  const updates: Partial<typeof openaiCodexConnections.$inferInsert> = {
    accountId,
    accessTokenCiphertext: encryptToken(refreshed.access_token, config.encryptionKey),
    refreshTokenCiphertext: encryptToken(refreshed.refresh_token, config.encryptionKey),
    expiryDate: resolveExpiresAt(refreshed.expires_in),
    scope: scopeArray(refreshed.scope),
    updatedAt: new Date()
  };
  if (identity.email) updates.email = identity.email;
  if (identity.chatgptPlanType) updates.chatgptPlanType = identity.chatgptPlanType;

  await context.db.update(openaiCodexConnections).set(updates).where(eq(openaiCodexConnections.id, connection.id));
  return { accessToken: refreshed.access_token, accountId };
}

async function exchangeOpenAICodexAuthorizationCode(code: string, codeVerifier: string) {
  const response = await fetch(`${openaiAuthBaseUrl}/oauth/token`, {
    method: "POST",
    headers: openAICodexHeaders("application/x-www-form-urlencoded"),
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: openaiCodexDeviceCallbackUrl,
      client_id: openaiCodexClientId,
      code_verifier: codeVerifier
    })
  });
  return tokenResponseSchema.parse(await readJsonResponse(response, "OpenAI Codex token exchange failed"));
}

async function refreshOpenAICodexToken(refreshToken: string) {
  const response = await fetch(`${openaiAuthBaseUrl}/oauth/token`, {
    method: "POST",
    headers: openAICodexHeaders("application/x-www-form-urlencoded"),
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: openaiCodexClientId
    })
  });
  return tokenResponseSchema.parse(await readJsonResponse(response, "OpenAI Codex token refresh failed"));
}

async function readJsonResponse(response: Response, prefix: string) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${prefix} (${response.status}): ${safeErrorText(text || response.statusText)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${prefix}: response was not valid JSON.`);
  }
}

function openAICodexHeaders(contentType: string) {
  return {
    "Content-Type": contentType,
    originator: "personal-context-os",
    "User-Agent": "personal-context-os/0.1.0"
  };
}

function hasOpenAICodexConfig(env: AppEnv) {
  return Boolean(env.OPENAI_CODEX_TOKEN_ENCRYPTION_KEY);
}

function requireOpenAICodexConfig(env: AppEnv) {
  if (!env.OPENAI_CODEX_TOKEN_ENCRYPTION_KEY) {
    throw new Error("OpenAI Codex OAuth is not configured. Set OPENAI_CODEX_TOKEN_ENCRYPTION_KEY to a base64-encoded 32-byte key.");
  }
  const encryptionKey = Buffer.from(env.OPENAI_CODEX_TOKEN_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("OPENAI_CODEX_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return { encryptionKey };
}

function getConnection(context: AppContext) {
  return context.db
    .select()
    .from(openaiCodexConnections)
    .where(eq(openaiCodexConnections.workspaceId, context.workspaceId))
    .limit(1)
    .then(([connection]) => connection ?? null);
}

function resolveEnvOpenAICodexToken(env: AppEnv) {
  if (!env.OPENAI_CODEX_ACCESS_TOKEN) return null;
  const identity = resolveOpenAICodexIdentity(env.OPENAI_CODEX_ACCESS_TOKEN);
  const accountId = env.OPENAI_CODEX_ACCOUNT_ID || identity.accountId;
  if (!accountId) return null;
  const expiresAt = env.OPENAI_CODEX_TOKEN_EXPIRES_AT ? new Date(env.OPENAI_CODEX_TOKEN_EXPIRES_AT) : resolveJwtExpiresAt(env.OPENAI_CODEX_ACCESS_TOKEN);
  if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) return null;
  return { accessToken: env.OPENAI_CODEX_ACCESS_TOKEN, accountId, expiresAt };
}

function resolveOpenAICodexIdentity(accessToken: string) {
  const payload = decodeJwtPayload(accessToken);
  const auth = readRecord(payload?.["https://api.openai.com/auth"]);
  const profile = readRecord(payload?.["https://api.openai.com/profile"]);
  return {
    accountId: readString(auth.chatgpt_account_id),
    chatgptPlanType: readString(auth.chatgpt_plan_type),
    email: readString(profile.email)
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function resolveJwtExpiresAt(token: string) {
  const exp = decodeJwtPayload(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? new Date(exp * 1000) : null;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveExpiresAt(expiresIn: number | undefined) {
  return expiresIn ? new Date(Date.now() + Math.max(1, expiresIn) * 1000) : null;
}

function scopeArray(value: string | undefined) {
  return value?.split(/\s+/).map((scope) => scope.trim()).filter(Boolean) ?? [];
}

function encryptToken(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

function decryptToken(value: string, key: Buffer) {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Invalid encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function safeErrorText(value: string) {
  return value
    .replace(/("?(?:access_token|refresh_token|id_token|code|code_verifier)"?\s*[:=]\s*")([^"]+)(")/gi, "$1[redacted]$3")
    .slice(0, 1000);
}

function assertUserContext(context: AppContext): asserts context is AppContext & { userId: string } {
  if (!context.userId) throw new Error("OpenAI Codex OAuth requires a signed-in user session.");
}
