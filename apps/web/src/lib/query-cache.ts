import { apiGet, type AnyRecord } from "./api";

type CachedQueryEntry<T = unknown> = {
  data?: T;
  promise?: Promise<T>;
  updatedAt?: number;
};

type CachedGetOptions = {
  force?: boolean;
};

const cachedQueries = new Map<string, CachedQueryEntry>();
let workspaceWarmPromise: Promise<void> | null = null;
const workspaceDataPrefixes = [
  "GET /api/dashboard",
  "GET /api/notes",
  "GET /api/projects",
  "GET /api/tasks",
  "GET /api/documents",
  "GET /api/reminders",
  "GET /api/raw-items",
  "GET /api/entities",
  "GET /api/review-queue",
  "GET /api/search",
  "GET /api/admin/data-inventory",
  "GET /api/retrieval-logs",
  "GET /api/audit-events",
  "GET /api/agents",
  "GET /api/google-calendar"
];

export function apiQueryKey(path: string, query?: AnyRecord) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }

  const search = params.toString();
  return search ? `GET ${path}?${search}` : `GET ${path}`;
}

export function peekCachedQuery<T = AnyRecord>(path: string, query?: AnyRecord): T | undefined {
  return cachedQueries.get(apiQueryKey(path, query))?.data as T | undefined;
}

export function setCachedQuery<T>(path: string, query: AnyRecord | undefined, data: T) {
  cachedQueries.set(apiQueryKey(path, query), {
    data,
    updatedAt: Date.now()
  });
}

export async function cachedApiGet<T = AnyRecord>(
  path: string,
  query?: AnyRecord,
  options: CachedGetOptions = {}
): Promise<T> {
  const key = apiQueryKey(path, query);
  const cached = cachedQueries.get(key) as CachedQueryEntry<T> | undefined;

  if (!options.force) {
    if (cached?.data !== undefined) return cached.data;
    if (cached?.promise) return cached.promise;
  }

  const request = apiGet<T>(path, query)
    .then((data) => {
      if (cachedQueries.get(key)?.promise === request) {
        cachedQueries.set(key, { data, updatedAt: Date.now() });
      }
      return data;
    })
    .catch((error) => {
      const current = cachedQueries.get(key);
      if (current?.promise === request) {
        if (current.data !== undefined) {
          const restored: CachedQueryEntry = { data: current.data };
          if (current.updatedAt !== undefined) {
            restored.updatedAt = current.updatedAt;
          }
          cachedQueries.set(key, restored);
        } else {
          cachedQueries.delete(key);
        }
      }
      throw error;
    });

  const pending: CachedQueryEntry<T> = { promise: request };
  if (cached?.data !== undefined) {
    pending.data = cached.data;
  }
  if (cached?.updatedAt !== undefined) {
    pending.updatedAt = cached.updatedAt;
  }
  cachedQueries.set(key, pending);
  return request;
}

export function invalidateCachedQueries(
  predicate: string | RegExp | ((key: string) => boolean)
) {
  for (const key of cachedQueries.keys()) {
    if (
      (typeof predicate === "string" && key.startsWith(predicate)) ||
      (predicate instanceof RegExp && predicate.test(key)) ||
      (typeof predicate === "function" && predicate(key))
    ) {
      cachedQueries.delete(key);
    }
  }
}

export function invalidateWorkspaceQueryCache() {
  workspaceWarmPromise = null;
  invalidateCachedQueries((key) => workspaceDataPrefixes.some((prefix) => key.startsWith(prefix)));
}

export function warmWorkspaceQueryCache() {
  if (workspaceWarmPromise) return workspaceWarmPromise;

  workspaceWarmPromise = Promise.all([
    cachedApiGet("/api/dashboard/today").catch(() => null),
    cachedApiGet("/api/notes").catch(() => null),
    cachedApiGet("/api/projects").catch(() => null),
    cachedApiGet("/api/tasks").catch(() => null),
    cachedApiGet("/api/documents").catch(() => null),
    cachedApiGet("/api/review-queue").catch(() => null)
  ])
    .then(() => undefined)
    .finally(() => {
      workspaceWarmPromise = null;
    });

  return workspaceWarmPromise;
}

export function prefetchDataForRoute(href: string) {
  const route = href.split("?")[0]?.replace(/\/$/, "") || "/dashboard";

  if (route === "/dashboard") {
    return Promise.all([
      cachedApiGet("/api/dashboard/today").catch(() => null),
      cachedApiGet("/api/notes").catch(() => null)
    ]).then(() => undefined);
  }

  if (route === "/notes") {
    return Promise.all([
      cachedApiGet("/api/notes").catch(() => null),
      cachedApiGet("/api/projects").catch(() => null)
    ]).then(() => undefined);
  }

  if (route === "/tasks") {
    return Promise.all([
      cachedApiGet("/api/tasks").catch(() => null),
      cachedApiGet("/api/projects").catch(() => null)
    ]).then(() => undefined);
  }

  if (route === "/projects") {
    return cachedApiGet("/api/projects")
      .catch(() => null)
      .then(() => undefined);
  }

  if (route.startsWith("/projects/")) {
    const projectId = route.split("/")[2];
    return Promise.all([
      cachedApiGet("/api/projects").catch(() => null),
      projectId
        ? cachedApiGet(`/api/projects/${projectId}/context`).catch(() => null)
        : Promise.resolve(null)
    ]).then(() => undefined);
  }

  if (route === "/documents") {
    return cachedApiGet("/api/documents")
      .catch(() => null)
      .then(() => undefined);
  }

  if (route === "/review") {
    return cachedApiGet("/api/review-queue")
      .catch(() => null)
      .then(() => undefined);
  }

  return Promise.resolve();
}
