export type AnyRecord = Record<string, any>;

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

interface ApiOptions {
  redirectOnUnauthorized?: boolean;
}

export async function apiGet<T = AnyRecord>(path: string, query?: AnyRecord, options: ApiOptions = {}): Promise<T> {
  const url = apiUrl(path);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { cache: "no-store", credentials: "include" });
  await throwIfNotOk(response, options);
  return response.json();
}

export async function apiPost<T = AnyRecord>(path: string, body: AnyRecord, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  await throwIfNotOk(response, options);
  return response.json();
}

export async function apiPatch<T = AnyRecord>(path: string, body: AnyRecord, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body)
  });
  await throwIfNotOk(response, options);
  return response.json();
}

export async function apiDelete<T = AnyRecord>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    method: "DELETE",
    credentials: "include"
  });
  await throwIfNotOk(response, options);
  return response.json();
}

export async function login(email: string, password: string) {
  return apiPost<{ user: AnyRecord; expiresAt: string }>("/api/auth/login", { email, password }, { redirectOnUnauthorized: false });
}

export async function logout() {
  return apiPost<{ ok: boolean }>("/api/auth/logout", {}, { redirectOnUnauthorized: false });
}

export async function getCurrentSession() {
  return apiGet<{ user: AnyRecord }>("/api/auth/me", undefined, { redirectOnUnauthorized: false });
}

async function throwIfNotOk(response: Response, options: ApiOptions) {
  if (response.ok) return;

  if (response.status === 401 && options.redirectOnUnauthorized !== false && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  throw new Error(await readErrorMessage(response));
}

function apiUrl(path: string) {
  if (API_BASE_URL) return new URL(path, API_BASE_URL);
  if (typeof window !== "undefined") return new URL(path, window.location.origin);
  return new URL(path, "http://localhost:3000");
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
