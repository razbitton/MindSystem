import "server-only";

import { cookies } from "next/headers";
import type { AnyRecord } from "./api";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

export async function getServerSession(): Promise<{ user: AnyRecord } | null> {
  const cookieStore = await cookies();
  const response = await fetch(new URL("/api/auth/me", API_BASE_URL), {
    headers: {
      cookie: cookieStore.toString()
    },
    cache: "no-store"
  });

  if (response.status === 401) return null;

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return response.json();
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text) return `Request failed with ${response.status}`;
  try {
    const json = JSON.parse(text);
    return typeof json.error === "string" ? json.error : text;
  } catch {
    return text;
  }
}
