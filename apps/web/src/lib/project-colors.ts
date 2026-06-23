import type { CSSProperties } from "react";
import type { AnyRecord } from "./api";

type ProjectColorTarget = "card" | "row" | "badge" | "swatch" | "text" | "accent";

const hexColorPattern = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

const legacyProjectColors: Record<string, string> = {
  slate: "#64748b",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  teal: "#14b8a6",
  emerald: "#10b981",
  lime: "#84cc16",
  amber: "#f59e0b",
  orange: "#f97316",
  rose: "#f43f5e",
  pink: "#ec4899",
  violet: "#8b5cf6",
  purple: "#a855f7"
};

export function projectColorValue(value?: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const legacyColor = legacyProjectColors[raw.toLowerCase()];
  if (legacyColor) return legacyColor;

  if (!hexColorPattern.test(raw)) return null;
  return normalizeHexColor(raw);
}

export function projectColorClass(value: unknown, target: ProjectColorTarget) {
  if (!projectColorValue(value)) return "";
  return `project-color-${target}`;
}

export function projectColorStyle(value: unknown) {
  const color = projectColorValue(value);
  return color ? ({ "--project-color": color } as CSSProperties) : undefined;
}

export function projectIdFromRecord(record: AnyRecord) {
  return String(record.projectId ?? record.project_id ?? "");
}

export function findProjectForRecord(projects: AnyRecord[], record: AnyRecord) {
  const projectId = projectIdFromRecord(record);
  if (!projectId) return null;
  return projects.find((project) => String(project.id) === projectId) ?? null;
}

function normalizeHexColor(color: string) {
  const normalized = color.toLowerCase();
  if (normalized.length === 7) return normalized;

  const [, red = "", green = "", blue = ""] = normalized;
  return `#${red}${red}${green}${green}${blue}${blue}`;
}
