import type { AnyRecord } from "./api";

export type ViewMode = "cards" | "list";
export type TaskViewMode = "board" | "list";

export function recordText(record: AnyRecord, keys: string[]) {
  return keys
    .map((key) => record[key])
    .filter((value) => value !== undefined && value !== null)
    .map(String)
    .join(" ")
    .toLowerCase();
}

export function matchesQuery(record: AnyRecord, query: string, keys: string[]) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  return recordText(record, keys).includes(normalizedQuery);
}

export function projectName(projects: AnyRecord[], projectId?: string | null) {
  if (!projectId) return "";
  return String(projects.find((project) => project.id === projectId)?.name ?? "");
}

export function dateValue(record: AnyRecord, camelKey: string) {
  const snakeKey = camelKey.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const value = record[camelKey] ?? record[snakeKey];
  return typeof value === "string" ? value : null;
}

export function toDateTimeInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const timezoneOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

export function fromDateTimeInput(value: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function truncate(value?: string | null, max = 180) {
  const text = String(value ?? "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

export function loadPreference<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return stored && allowed.includes(stored as T) ? (stored as T) : fallback;
}

export function savePreference(key: string, value: string) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, value);
  }
}
