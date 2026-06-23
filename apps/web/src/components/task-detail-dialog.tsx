"use client";

import { CalendarClock, CheckCircle2, Clock3, Edit2, Folder, Trash2, UserRound } from "lucide-react";
import { type AnyRecord } from "../lib/api";
import { findProjectForRecord, projectColorClass, projectColorStyle } from "../lib/project-colors";
import { dateValue, projectName } from "../lib/view-models";
import { useI18n } from "../i18n";
import { Drawer, PriorityBadge, StatusBadge } from "./page";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TaskDetailDialogProps = {
  open: boolean;
  task: AnyRecord | null;
  projects?: AnyRecord[];
  onClose: () => void;
  onEdit?: (task: AnyRecord) => void;
  onComplete?: (id: string) => void | Promise<void>;
  onDelete?: (task: AnyRecord) => void;
};

export function TaskDetailDialog({
  open,
  task,
  projects = [],
  onClose,
  onEdit,
  onComplete,
  onDelete
}: TaskDetailDialogProps) {
  const { t, formatDate } = useI18n();

  if (!task) return null;

  const title = String(task.title ?? t("entity.task"));
  const description = String(task.description ?? "").trim();
  const assignee = String(task.assignee ?? "").trim();
  const estimateMinutes = task.estimateMinutes ?? task.estimate_minutes;
  const linkedProject = findProjectForRecord(projects, task);
  const project = linkedProject?.name ?? projectName(projects, String(task.projectId ?? task.project_id ?? ""));
  const dueAt = dateValue(task, "dueAt");
  const scheduledFor = dateValue(task, "scheduledFor");
  const createdAt = dateValue(task, "createdAt");
  const updatedAt = dateValue(task, "updatedAt");
  const completedAt = dateValue(task, "completedAt");
  const isDone = task.status === "done";

  return (
    <Drawer
      open={open}
      title={t("common.details")}
      onClose={onClose}
      hideHeader
      contentClassName="border-0 bg-transparent p-0 shadow-none sm:max-w-xl"
      bodyClassName="overflow-visible p-0 sm:p-0"
    >
      <article
        className={cn(
          "relative w-full overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg shadow-black/10",
          projectColorClass(linkedProject?.color, "card")
        )}
        style={projectColorStyle(linkedProject?.color)}
      >
        <div className="flex max-h-[min(42rem,calc(100svh_-_2rem))] flex-col md:max-h-[min(72rem,calc(100svh_-_1rem))]">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex min-w-0 flex-col gap-3 pe-10">
                <h2
                  className={cn(
                    "break-words text-start text-base font-semibold leading-6 text-foreground [overflow-wrap:anywhere]",
                    isDone && "text-muted-foreground line-through"
                  )}
                  dir="auto"
                >
                  {title}
                </h2>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <StatusBadge value={task.status} />
                  <PriorityBadge value={task.priority} />
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/50 p-3">
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words text-start text-sm leading-relaxed [overflow-wrap:anywhere]",
                    description ? "text-foreground" : "text-muted-foreground"
                  )}
                  dir="auto"
                >
                  {description || t("common.noDescription")}
                </p>
              </div>

              <div className="grid min-w-0 gap-2 rounded-xl border border-border bg-background/50 p-3 sm:grid-cols-2">
                <TaskDetailField icon={Folder} label={t("common.project")} value={project || t("common.noProject")} />
                {assignee ? <TaskDetailField icon={UserRound} label={t("tasks.assignee")} value={assignee} /> : null}
                <TaskDetailField icon={CalendarClock} label={t("tasks.dueAt")} value={formatDate(dueAt)} />
                <TaskDetailField icon={CalendarClock} label={t("tasks.scheduledFor")} value={formatDate(scheduledFor)} />
                {estimateMinutes ? (
                  <TaskDetailField icon={Clock3} label={t("tasks.estimateMinutes")} value={String(estimateMinutes)} />
                ) : null}
                <TaskDetailField icon={Clock3} label={t("common.updated")} value={formatDate(updatedAt)} />
                {createdAt ? <TaskDetailField icon={Clock3} label={t("common.created")} value={formatDate(createdAt)} /> : null}
                {completedAt ? <TaskDetailField icon={CheckCircle2} label={t("tasks.completed")} value={formatDate(completedAt)} /> : null}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-3 sm:px-4">
            <div>
              {onDelete ? (
                <Button
                  type="button"
                  variant="delete"
                  size="sm"
                  onClick={() => onDelete(task)}
                >
                  <Trash2 data-icon="inline-start" />
                  {t("common.delete")}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {onEdit ? (
                <Button type="button" variant="edit" size="sm" onClick={() => onEdit(task)}>
                  <Edit2 data-icon="inline-start" />
                  {t("common.edit")}
                </Button>
              ) : null}
              {onComplete ? (
                <Button
                  type="button"
                  size="sm"
                  variant={isDone ? "secondary" : "default"}
                  disabled={isDone}
                  onClick={() => void onComplete(String(task.id))}
                >
                  <CheckCircle2 data-icon="inline-start" />
                  {isDone ? t("tasks.completed") : t("tasks.markDone")}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </article>
    </Drawer>
  );
}

function TaskDetailField({
  icon: Icon,
  label,
  value
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2 text-start">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="break-words text-sm text-foreground [overflow-wrap:anywhere]" dir="auto">
          {value}
        </p>
      </div>
    </div>
  );
}
