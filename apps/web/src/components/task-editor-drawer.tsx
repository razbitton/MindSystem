"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { type AnyRecord } from "../lib/api";
import { projectColorClass, projectColorStyle, projectColorValue } from "../lib/project-colors";
import { dateValue, fromDateTimeInput, taskKind as taskKindValue, toDateTimeInput, type TaskKind } from "../lib/view-models";
import { useI18n } from "../i18n";
import { Drawer, SegmentedControl } from "./page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const statuses = ["inbox", "todo", "in_progress", "waiting", "done", "cancelled"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const NO_PROJECT = "__none__";

type TaskForm = {
  title: string;
  description: string;
  projectId: string;
  kind: TaskKind;
  status: string;
  priority: string;
  dueAt: string;
  scheduledFor: string;
  estimateMinutes: string;
  assignee: string;
};

export type TaskEditorPayload = {
  title: string;
  description?: string;
  projectId: string | null;
  kind: TaskKind;
  status: string;
  priority: string;
  dueAt: string | null;
  scheduledFor: string | null;
  estimateMinutes: number | null;
  assignee: string | null;
};

type TaskEditorDrawerProps = {
  open: boolean;
  task: AnyRecord | null;
  projects: AnyRecord[];
  defaultProjectId?: string;
  defaultStatus?: string;
  defaultPriority?: string;
  onClose: () => void;
  onSave: (payload: TaskEditorPayload, task: AnyRecord | null) => void | Promise<void>;
  onDelete?: (task: AnyRecord) => void;
};

export function TaskEditorDrawer({
  open,
  task,
  projects,
  defaultProjectId = "",
  defaultStatus = "todo",
  defaultPriority = "medium",
  onClose,
  onSave,
  onDelete
}: TaskEditorDrawerProps) {
  const { t, formatDate, translateValue } = useI18n();
  const [form, setForm] = useState<TaskForm>(blankForm());
  const [saving, setSaving] = useState(false);
  const statusOptions = form.kind === "ongoing" ? statuses.filter((status) => status !== "done") : statuses;

  useEffect(() => {
    if (!open) return;

    setForm(
      task
        ? formFromTask(task)
        : {
            ...blankForm(),
            projectId: defaultProjectId,
            priority: defaultPriority || "medium",
            status: defaultStatus || "todo"
          }
    );
  }, [open, task, defaultProjectId, defaultPriority, defaultStatus]);

  async function handleSave() {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(payloadFromForm(form), task);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      title={task ? t("tasks.editTask") : t("tasks.newTask")}
      subtitle={task ? formatDate(dateValue(task, "updatedAt")) : t("tasks.subtitle")}
      onClose={onClose}
      footer={
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {task && onDelete ? (
              <Button type="button" variant="delete" onClick={() => onDelete(task)}>
                <Trash2 data-icon="inline-start" />
                {t("common.delete")}
              </Button>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={!form.title.trim() || saving}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-title">{t("common.title")}</Label>
          <Input
            id="task-title"
            dir="auto"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="task-description">{t("common.description")}</Label>
          <Textarea
            id="task-description"
            dir="auto"
            rows={4}
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{t("tasks.kind")}</Label>
          <SegmentedControl
            label={t("tasks.kind")}
            value={form.kind}
            options={[
              { value: "one_off", label: t("tasks.kindOneOff") },
              { value: "ongoing", label: t("tasks.kindOngoing") }
            ]}
            onChange={(kind) => setForm(normalizeFormForKind({ ...form, kind }))}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-project">{t("common.project")}</Label>
            <Select
              value={form.projectId || NO_PROJECT}
              onValueChange={(value) => setForm({ ...form, projectId: value === NO_PROJECT ? "" : value })}
            >
              <SelectTrigger id="task-project" className="w-full">
                <SelectValue placeholder={t("common.noProject")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>{t("common.noProject")}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {projectColorValue(project.color) ? (
                        <span
                          className={cn("size-2.5 shrink-0 rounded-full", projectColorClass(project.color, "swatch"))}
                          style={projectColorStyle(project.color)}
                          aria-hidden
                        />
                      ) : null}
                      <span className="truncate" dir="auto">
                        {project.name}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-status">{t("common.status")}</Label>
            <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
              <SelectTrigger id="task-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status} value={status}>
                    {translateValue("status", status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-priority">{t("common.priority")}</Label>
            <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
              <SelectTrigger id="task-priority" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priorities.map((priority) => (
                  <SelectItem key={priority} value={priority}>
                    {translateValue("priority", priority)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="task-assignee">{t("tasks.assignee")}</Label>
            <Input
              id="task-assignee"
              dir="auto"
              value={form.assignee}
              onChange={(event) => setForm({ ...form, assignee: event.target.value })}
            />
          </div>
        </div>
        {form.kind === "one_off" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="task-due">{t("tasks.dueAt")}</Label>
                <Input
                  id="task-due"
                  type="datetime-local"
                  value={form.dueAt}
                  onChange={(event) => setForm({ ...form, dueAt: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="task-scheduled">{t("tasks.scheduledFor")}</Label>
                <Input
                  id="task-scheduled"
                  type="datetime-local"
                  value={form.scheduledFor}
                  onChange={(event) => setForm({ ...form, scheduledFor: event.target.value })}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="task-estimate">{t("tasks.estimateMinutes")}</Label>
              <Input
                id="task-estimate"
                type="number"
                min="1"
                value={form.estimateMinutes}
                onChange={(event) => setForm({ ...form, estimateMinutes: event.target.value })}
              />
            </div>
          </>
        ) : null}
      </div>
    </Drawer>
  );
}

function formFromTask(task: AnyRecord): TaskForm {
  return normalizeFormForKind({
    title: String(task.title ?? ""),
    description: String(task.description ?? ""),
    projectId: String(task.projectId ?? task.project_id ?? ""),
    kind: taskKindValue(task),
    status: String(task.status ?? "todo"),
    priority: String(task.priority ?? "medium"),
    dueAt: toDateTimeInput(dateValue(task, "dueAt")),
    scheduledFor: toDateTimeInput(dateValue(task, "scheduledFor")),
    estimateMinutes: task.estimateMinutes ?? task.estimate_minutes ? String(task.estimateMinutes ?? task.estimate_minutes) : "",
    assignee: String(task.assignee ?? "")
  });
}

function payloadFromForm(form: TaskForm): TaskEditorPayload {
  const payload: TaskEditorPayload = {
    title: form.title,
    projectId: form.projectId || null,
    kind: form.kind,
    status: form.kind === "ongoing" && form.status === "done" ? "todo" : form.status,
    priority: form.priority,
    dueAt: form.kind === "ongoing" ? null : fromDateTimeInput(form.dueAt),
    scheduledFor: form.kind === "ongoing" ? null : fromDateTimeInput(form.scheduledFor),
    estimateMinutes: form.kind === "ongoing" ? null : form.estimateMinutes.trim() ? Number(form.estimateMinutes) : null,
    assignee: form.assignee.trim() || null
  };

  if (form.description) payload.description = form.description;
  return payload;
}

function blankForm(): TaskForm {
  return {
    title: "",
    description: "",
    projectId: "",
    kind: "one_off",
    status: "todo",
    priority: "medium",
    dueAt: "",
    scheduledFor: "",
    estimateMinutes: "",
    assignee: ""
  };
}

function normalizeFormForKind(form: TaskForm): TaskForm {
  if (form.kind !== "ongoing") return form;
  return {
    ...form,
    status: form.status === "done" ? "todo" : form.status,
    dueAt: "",
    scheduledFor: "",
    estimateMinutes: ""
  };
}
