import type { AnyRecord } from "./api";

export const projectColorOptions = [
  "slate",
  "blue",
  "cyan",
  "teal",
  "emerald",
  "lime",
  "amber",
  "orange",
  "rose",
  "pink",
  "violet",
  "purple"
] as const;

export type ProjectColor = (typeof projectColorOptions)[number];
type ProjectColorTarget = "card" | "row" | "badge" | "swatch" | "text" | "accent";

const colorClassMap: Record<ProjectColor, Record<ProjectColorTarget, string>> = {
  slate: {
    card: "border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-500/25 dark:bg-slate-900/25 dark:hover:border-slate-400/35",
    row: "border-slate-200/70 bg-slate-50/55 hover:bg-slate-100/60 dark:border-slate-500/20 dark:bg-slate-900/20 dark:hover:bg-slate-900/35",
    badge: "border-slate-200 bg-slate-100/80 text-slate-700 dark:border-slate-500/25 dark:bg-slate-900/45 dark:text-slate-200",
    swatch: "bg-slate-500",
    text: "text-slate-700 dark:text-slate-200",
    accent: "bg-slate-500"
  },
  blue: {
    card: "border-blue-200 bg-blue-50/70 hover:border-blue-300 dark:border-blue-400/30 dark:bg-blue-950/20 dark:hover:border-blue-400/45",
    row: "border-blue-200/70 bg-blue-50/55 hover:bg-blue-100/50 dark:border-blue-400/25 dark:bg-blue-950/15 dark:hover:bg-blue-950/30",
    badge: "border-blue-200 bg-blue-100/75 text-blue-800 dark:border-blue-400/30 dark:bg-blue-950/40 dark:text-blue-200",
    swatch: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-300",
    accent: "bg-blue-500"
  },
  cyan: {
    card: "border-cyan-200 bg-cyan-50/70 hover:border-cyan-300 dark:border-cyan-400/30 dark:bg-cyan-950/20 dark:hover:border-cyan-400/45",
    row: "border-cyan-200/70 bg-cyan-50/55 hover:bg-cyan-100/50 dark:border-cyan-400/25 dark:bg-cyan-950/15 dark:hover:bg-cyan-950/30",
    badge: "border-cyan-200 bg-cyan-100/75 text-cyan-800 dark:border-cyan-400/30 dark:bg-cyan-950/40 dark:text-cyan-200",
    swatch: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-300",
    accent: "bg-cyan-500"
  },
  teal: {
    card: "border-teal-200 bg-teal-50/70 hover:border-teal-300 dark:border-teal-400/30 dark:bg-teal-950/20 dark:hover:border-teal-400/45",
    row: "border-teal-200/70 bg-teal-50/55 hover:bg-teal-100/50 dark:border-teal-400/25 dark:bg-teal-950/15 dark:hover:bg-teal-950/30",
    badge: "border-teal-200 bg-teal-100/75 text-teal-800 dark:border-teal-400/30 dark:bg-teal-950/40 dark:text-teal-200",
    swatch: "bg-teal-500",
    text: "text-teal-700 dark:text-teal-300",
    accent: "bg-teal-500"
  },
  emerald: {
    card: "border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 dark:border-emerald-400/30 dark:bg-emerald-950/20 dark:hover:border-emerald-400/45",
    row: "border-emerald-200/70 bg-emerald-50/55 hover:bg-emerald-100/50 dark:border-emerald-400/25 dark:bg-emerald-950/15 dark:hover:bg-emerald-950/30",
    badge: "border-emerald-200 bg-emerald-100/75 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-950/40 dark:text-emerald-200",
    swatch: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
    accent: "bg-emerald-500"
  },
  lime: {
    card: "border-lime-200 bg-lime-50/70 hover:border-lime-300 dark:border-lime-400/30 dark:bg-lime-950/20 dark:hover:border-lime-400/45",
    row: "border-lime-200/70 bg-lime-50/55 hover:bg-lime-100/50 dark:border-lime-400/25 dark:bg-lime-950/15 dark:hover:bg-lime-950/30",
    badge: "border-lime-200 bg-lime-100/75 text-lime-800 dark:border-lime-400/30 dark:bg-lime-950/40 dark:text-lime-200",
    swatch: "bg-lime-500",
    text: "text-lime-700 dark:text-lime-300",
    accent: "bg-lime-500"
  },
  amber: {
    card: "border-amber-200 bg-amber-50/70 hover:border-amber-300 dark:border-amber-400/30 dark:bg-amber-950/20 dark:hover:border-amber-400/45",
    row: "border-amber-200/70 bg-amber-50/55 hover:bg-amber-100/50 dark:border-amber-400/25 dark:bg-amber-950/15 dark:hover:bg-amber-950/30",
    badge: "border-amber-200 bg-amber-100/75 text-amber-800 dark:border-amber-400/30 dark:bg-amber-950/40 dark:text-amber-200",
    swatch: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
    accent: "bg-amber-500"
  },
  orange: {
    card: "border-orange-200 bg-orange-50/70 hover:border-orange-300 dark:border-orange-400/30 dark:bg-orange-950/20 dark:hover:border-orange-400/45",
    row: "border-orange-200/70 bg-orange-50/55 hover:bg-orange-100/50 dark:border-orange-400/25 dark:bg-orange-950/15 dark:hover:bg-orange-950/30",
    badge: "border-orange-200 bg-orange-100/75 text-orange-800 dark:border-orange-400/30 dark:bg-orange-950/40 dark:text-orange-200",
    swatch: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300",
    accent: "bg-orange-500"
  },
  rose: {
    card: "border-rose-200 bg-rose-50/70 hover:border-rose-300 dark:border-rose-400/30 dark:bg-rose-950/20 dark:hover:border-rose-400/45",
    row: "border-rose-200/70 bg-rose-50/55 hover:bg-rose-100/50 dark:border-rose-400/25 dark:bg-rose-950/15 dark:hover:bg-rose-950/30",
    badge: "border-rose-200 bg-rose-100/75 text-rose-800 dark:border-rose-400/30 dark:bg-rose-950/40 dark:text-rose-200",
    swatch: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
    accent: "bg-rose-500"
  },
  pink: {
    card: "border-pink-200 bg-pink-50/70 hover:border-pink-300 dark:border-pink-400/30 dark:bg-pink-950/20 dark:hover:border-pink-400/45",
    row: "border-pink-200/70 bg-pink-50/55 hover:bg-pink-100/50 dark:border-pink-400/25 dark:bg-pink-950/15 dark:hover:bg-pink-950/30",
    badge: "border-pink-200 bg-pink-100/75 text-pink-800 dark:border-pink-400/30 dark:bg-pink-950/40 dark:text-pink-200",
    swatch: "bg-pink-500",
    text: "text-pink-700 dark:text-pink-300",
    accent: "bg-pink-500"
  },
  violet: {
    card: "border-violet-200 bg-violet-50/70 hover:border-violet-300 dark:border-violet-400/30 dark:bg-violet-950/20 dark:hover:border-violet-400/45",
    row: "border-violet-200/70 bg-violet-50/55 hover:bg-violet-100/50 dark:border-violet-400/25 dark:bg-violet-950/15 dark:hover:bg-violet-950/30",
    badge: "border-violet-200 bg-violet-100/75 text-violet-800 dark:border-violet-400/30 dark:bg-violet-950/40 dark:text-violet-200",
    swatch: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-300",
    accent: "bg-violet-500"
  },
  purple: {
    card: "border-purple-200 bg-purple-50/70 hover:border-purple-300 dark:border-purple-400/30 dark:bg-purple-950/20 dark:hover:border-purple-400/45",
    row: "border-purple-200/70 bg-purple-50/55 hover:bg-purple-100/50 dark:border-purple-400/25 dark:bg-purple-950/15 dark:hover:bg-purple-950/30",
    badge: "border-purple-200 bg-purple-100/75 text-purple-800 dark:border-purple-400/30 dark:bg-purple-950/40 dark:text-purple-200",
    swatch: "bg-purple-500",
    text: "text-purple-700 dark:text-purple-300",
    accent: "bg-purple-500"
  }
};

export function projectColorValue(value?: unknown) {
  const color = String(value ?? "");
  return projectColorOptions.includes(color as ProjectColor) ? (color as ProjectColor) : null;
}

export function projectColorClass(value: unknown, target: ProjectColorTarget) {
  const color = projectColorValue(value);
  return color ? colorClassMap[color][target] : "";
}

export function projectIdFromRecord(record: AnyRecord) {
  return String(record.projectId ?? record.project_id ?? "");
}

export function findProjectForRecord(projects: AnyRecord[], record: AnyRecord) {
  const projectId = projectIdFromRecord(record);
  if (!projectId) return null;
  return projects.find((project) => String(project.id) === projectId) ?? null;
}
