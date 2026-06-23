import { z } from "zod";

const rawEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional().or(z.literal("")),
  REDIS_HOST: z.string().optional().or(z.literal("")),
  REDIS_PORT: z.string().default("6379"),
  REDIS_USERNAME: z.string().optional().or(z.literal("")),
  REDIS_PASSWORD: z.string().optional().or(z.literal("")),
  REDIS_TLS: z.string().optional().or(z.literal("")),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_ACCESS_KEY: z.string().default("minio"),
  S3_SECRET_KEY: z.string().default("minio123"),
  S3_BUCKET: z.string().default("personal-context-os"),
  S3_REGION: z.string().default("us-east-1"),
  JWT_SECRET: z.string().min(16).default("change-me-in-production"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  MCP_SERVER_URL: z.string().url().default("http://localhost:4100"),
  BOOTSTRAP_USER_EMAIL: z.string().email().default("admin@me.com"),
  BOOTSTRAP_USER_NAME: z.string().default("Local User"),
  BOOTSTRAP_USER_PASSWORD: z.string().min(8).optional().or(z.literal("")),
  SESSION_COOKIE_DOMAIN: z.string().optional().or(z.literal("")),
  OPENAI_API_KEY: z.string().optional().or(z.literal(""))
});

export const envSchema = rawEnvSchema.transform((env) => ({
  ...env,
  REDIS_URL: env.REDIS_URL || buildRedisUrl(env)
}));

function buildRedisUrl(env: z.infer<typeof rawEnvSchema>) {
  if (!env.REDIS_HOST) return "redis://localhost:6379";
  const protocol = env.REDIS_TLS === "true" ? "rediss" : "redis";
  const credentials =
    env.REDIS_USERNAME || env.REDIS_PASSWORD
      ? `${encodeURIComponent(env.REDIS_USERNAME || "default")}:${encodeURIComponent(env.REDIS_PASSWORD || "")}@`
      : "";
  return `${protocol}://${credentials}${env.REDIS_HOST}:${env.REDIS_PORT}`;
}

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(env);
}
