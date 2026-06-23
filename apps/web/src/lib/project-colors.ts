import type { CSSProperties } from "react";
import type { AnyRecord } from "./api";

type ProjectColorTarget = "card" | "row" | "badge" | "swatch" | "text" | "accent";

const hexColorPattern = /^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
const fallbackPickerColor = "#4f46e5";

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

export const projectColorPalette = buildProjectColorPalette();

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

export function projectColorPickerValue(value: unknown) {
  return projectColorValue(value) ?? fallbackPickerColor;
}

export function projectIdFromRecord(record: AnyRecord) {
  return String(record.projectId ?? record.project_id ?? "");
}

export function findProjectForRecord(projects: AnyRecord[], record: AnyRecord) {
  const projectId = projectIdFromRecord(record);
  if (!projectId) return null;
  return projects.find((project) => String(project.id) === projectId) ?? null;
}

function buildProjectColorPalette() {
  const hues = Array.from({ length: 24 }, (_, index) => index * 15);
  const tones = [
    { saturation: 72, lightness: 38 },
    { saturation: 82, lightness: 48 },
    { saturation: 84, lightness: 58 },
    { saturation: 78, lightness: 68 }
  ];

  return tones.flatMap((tone) =>
    hues.map((hue) => hslToHex(hue, tone.saturation, tone.lightness))
  );
}

function normalizeHexColor(color: string) {
  const normalized = color.toLowerCase();
  if (normalized.length === 7) return normalized;

  const [, red = "", green = "", blue = ""] = normalized;
  return `#${red}${red}${green}${green}${blue}${blue}`;
}

function hslToHex(hue: number, saturation: number, lightness: number) {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  const [red, green, blue] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];

  return `#${toHex(red + m)}${toHex(green + m)}${toHex(blue + m)}`;
}

function toHex(value: number) {
  return Math.round(value * 255).toString(16).padStart(2, "0");
}
