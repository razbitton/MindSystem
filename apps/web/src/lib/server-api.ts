import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { AnyRecord } from "./api";

const API_BASE_URL = process.env.API_BASE_URL ?? "http://127.0.0.1:4000";

export async function serverApiGet<T = AnyRecord>(
  path: string,
  query?: AnyRecord
): Promise<T> {
  const url = new URL(path, API_BASE_URL);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const cookieStore = await cookies();
  const response = await fetch(url, {
    headers: {
      cookie: cookieStore.toString()
    },
    cache: "no-store"
  });

  if (response.status === 401) {
    redirect("/login");
  }

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
