import type { AppEnv } from "@personal-context-os/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Pool } from "pg";

const openaiAuthBaseUrl = "https://auth.openai.com";
const openaiCodexClientId = "app_EMoamEEZ73f0CkXaXp7hrann";

type StoredConnection = {
  id: string;
  account_id: string;
  email: string | null;
  chatgpt_plan_type: string | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  expiry_date: Date | null;
};

export async function resolveOpenAICodexAccessTokenForWorkspace(pool: Pool, env: AppEnv, workspaceId: string) {
  const envToken = resolveEnvOpenAICodexToken(env);
  if (envToken) return { accessToken: envToken.accessToken, accountId: envToken.accountId };

  const result = await pool.query<StoredConnection>(
    `select id, account_id, email, chatgpt_plan_type, access_token_ciphertext, refresh_token_ciphertext, expiry_date
     from openai_codex_connections
     where workspace_id = $1
     limit 1`,
    [workspaceId]
  );
  const connection = result.rows[0];
  if (!connection) return null;

  const encryptionKey = requireOpenAICodexEncryptionKey(env);
  if (connection.expiry_date && connection.expiry_date.getTime() > Date.now() + 60_000) {
    return {
      accessToken: decryptToken(connection.access_token_ciphertext, encryptionKey),
      accountId: connection.account_id
    };
  }

  const refreshed = await refreshOpenAICodexToken(decryptToken(connection.refresh_token_ciphertext, encryptionKey));
  const identity = resolveOpenAICodexIdentity(refreshed.access_token);
  const accountId = identity.accountId ?? connection.account_id;
  await pool.query(
    `update openai_codex_connections
     set account_id = $2,
         email = coalesce($3, email),
         chatgpt_plan_type = coalesce($4, chatgpt_plan_type),
         access_token_ciphertext = $5,
         refresh_token_ciphertext = $6,
         expiry_date = $7,
         scope = $8,
         updated_at = now()
     where id = $1`,
    [
      connection.id,
      accountId,
      identity.email ?? null,
      identity.chatgptPlanType ?? null,
      encryptToken(refreshed.access_token, encryptionKey),
      encryptToken(refreshed.refresh_token, encryptionKey),
      resolveExpiresAt(refreshed.expires_in),
      scopeArray(refreshed.scope)
    ]
  );

  return { accessToken: refreshed.access_token, accountId };
}

function resolveEnvOpenAICodexToken(env: AppEnv) {
  if (!env.OPENAI_CODEX_ACCESS_TOKEN) return null;
  const identity = resolveOpenAICodexIdentity(env.OPENAI_CODEX_ACCESS_TOKEN);
  const accountId = env.OPENAI_CODEX_ACCOUNT_ID || identity.accountId;
  if (!accountId) return null;
  const expiresAt = env.OPENAI_CODEX_TOKEN_EXPIRES_AT ? new Date(env.OPENAI_CODEX_TOKEN_EXPIRES_AT) : resolveJwtExpiresAt(env.OPENAI_CODEX_ACCESS_TOKEN);
  if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) return null;
  return { accessToken: env.OPENAI_CODEX_ACCESS_TOKEN, accountId };
}

function requireOpenAICodexEncryptionKey(env: AppEnv) {
  if (!env.OPENAI_CODEX_TOKEN_ENCRYPTION_KEY) {
    throw new Error("OpenAI Codex OAuth is not configured. Set OPENAI_CODEX_TOKEN_ENCRYPTION_KEY to a base64-encoded 32-byte key.");
  }
  const encryptionKey = Buffer.from(env.OPENAI_CODEX_TOKEN_ENCRYPTION_KEY, "base64");
  if (encryptionKey.length !== 32) {
    throw new Error("OPENAI_CODEX_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return encryptionKey;
}

async function refreshOpenAICodexToken(refreshToken: string) {
  const response = await fetch(`${openaiAuthBaseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", originator: "personal-context-os" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: openaiCodexClientId
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`OpenAI Codex token refresh failed (${response.status}): ${safeErrorText(text || response.statusText)}`);
  return parseTokenResponse(JSON.parse(text));
}

function parseTokenResponse(value: unknown) {
  const body = readRecord(value);
  const accessToken = readString(body.access_token);
  const refreshToken = readString(body.refresh_token);
  if (!accessToken || !refreshToken) throw new Error("OpenAI Codex token refresh response did not include access and refresh tokens.");
  const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : undefined;
  const scope = readString(body.scope);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    ...(expiresIn ? { expires_in: expiresIn } : {}),
    ...(scope ? { scope } : {})
  };
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
