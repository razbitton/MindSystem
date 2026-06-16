"use client";

import { X } from "lucide-react";
import { useI18n } from "../i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * ViewHeader (exported as PageHeader for backwards-compat).
 * Calm, single-line header: small title, optional muted one-liner, actions inline-end.
 * No loud eyebrow by default — it renders as a quiet uppercase label only when provided.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col gap-1">
        {eyebrow ? (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className="text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
          dir="auto"
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground" dir="auto">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/**
 * Section (exported as Panel for backwards-compat).
 * A quiet grouping: small medium-weight label instead of a big heading, hairline card surface.
 */
export function Panel({
  title,
  children,
  action,
  className = ""
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-xs",
        className
      )}
    >
      {title || action ? (
        <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          {title ? (
            <h2 className="text-sm font-medium text-foreground" dir="auto">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action ? <div className="flex items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  children,
  action
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      {title ? (
        <p className="text-sm font-medium text-foreground" dir="auto">
          {title}
        </p>
      ) : null}
      <div className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground" dir="auto">
        {children}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function IconButton({
  label,
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("text-muted-foreground hover:text-foreground", className)}
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </Button>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
      <TabsList aria-label={label}>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value} className="gap-1.5">
            {option.icon}
            <span>{option.label}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/**
 * Drawer (now built on shadcn Sheet). Slides from the inline-end edge,
 * respects RTL automatically via the Sheet side handling.
 */
export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle dir="auto">{title}</SheetTitle>
          {subtitle ? <SheetDescription dir="auto">{subtitle}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer ? (
          <SheetFooter className="border-t border-border">{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function PriorityBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  const variant =
    value === "urgent"
      ? "destructive"
      : value === "high"
        ? "warning"
        : value === "low"
          ? "muted"
          : "info";
  return <Badge variant={variant}>{translateValue("priority", value ?? "medium")}</Badge>;
}

export function StatusBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  const variant =
    value === "done" || value === "completed" || value === "approved"
      ? "success"
      : value === "waiting" || value === "pending" || value === "review"
        ? "warning"
        : value === "failed" || value === "cancelled" || value === "rejected"
          ? "destructive"
          : "secondary";
  return <Badge variant={variant}>{translateValue("status", value ?? "active")}</Badge>;
}

export function EntityBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  return <Badge variant="outline">{translateValue("entity", value ?? "note")}</Badge>;
}

export function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <strong className="font-medium text-foreground" dir="auto">
        {value}
      </strong>
    </span>
  );
}

/** Inline close button kept for any view that imports the X affordance directly. */
export function CloseButton({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  return (
    <IconButton label={t("common.close")} onClick={onClose}>
      <X aria-hidden />
    </IconButton>
  );
}
