import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default("redis://localhost:6379"),
  S3_ENDPOINT: z.string().url().default("http://localhost:9000"),
  S3_ACCESS_KEY: z.string().default("minio"),
  S3_SECRET_KEY: z.string().default("minio123"),
  S3_BUCKET: z.string().default("personal-context-os"),
  JWT_SECRET: z.string().min(16).default("change-me-in-production"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  MCP_SERVER_URL: z.string().url().default("http://localhost:4100"),
  BOOTSTRAP_USER_EMAIL: z.string().email().default("local@personal-context-os.test"),
  BOOTSTRAP_USER_NAME: z.string().default("Local User"),
  BOOTSTRAP_USER_PASSWORD: z.string().min(12).optional().or(z.literal("")),
  SESSION_COOKIE_DOMAIN: z.string().optional().or(z.literal("")),
  OPENAI_API_KEY: z.string().optional().or(z.literal(""))
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return envSchema.parse(env);
}
