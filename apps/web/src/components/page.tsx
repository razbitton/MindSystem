"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useI18n } from "../i18n";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * ViewHeader (exported as PageHeader for backwards-compat).
 * Calm, single-line header: small title, optional muted one-liner, actions inline-end.
 * No loud eyebrow by default — it renders as a quiet uppercase label only when provided.
 */
export function PageHeader({
  eyebrow,
  title,
  actions,
  backHref,
  backLabel
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  const router = useRouter();
  const { direction, t } = useI18n();
  const BackIcon = direction === "rtl" ? ArrowRight : ArrowLeft;

  function goBack() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    if (backHref) router.push(backHref);
  }

  return (
    <header className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {backHref ? (
          <IconButton
            label={backLabel ?? t("common.back")}
            className="mt-0.5 shrink-0"
            onClick={goBack}
          >
            <BackIcon className="size-4" aria-hidden />
          </IconButton>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1
            className="min-w-0 text-pretty text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            dir="auto"
          >
            {title}
          </h1>
        </div>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div> : null}
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
  className = "",
  style
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties | undefined;
}) {
  return (
    <section
      className={cn(
        "bounded-surface flex min-w-0 max-w-full flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xs",
        className
      )}
      style={style}
    >
      {title || action ? (
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          {title ? (
            <h2 className="min-w-0 text-sm font-medium text-foreground" dir="auto">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action ? <div className="flex min-w-0 items-center gap-2">{action}</div> : null}
        </div>
      ) : null}
      <div className="bounded-scroll min-w-0 max-w-full p-4 sm:p-5">{children}</div>
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
  action,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: React.ReactNode;
  action?: "edit" | "delete";
}) {
  return (
    <Button
      type="button"
      variant={action ?? "ghost"}
      size="icon"
      className={cn(!action && "text-muted-foreground hover:text-foreground", className)}
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

/** Shared edit surface. Opens as a centered floating modal with a scrollable body. */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  hideHeader = false,
  contentClassName,
  bodyClassName,
  footerClassName
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  hideHeader?: boolean;
  contentClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent
        className={cn(
          "flex max-h-[min(46rem,calc(100svh_-_2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(58rem,calc(100svh_-_2rem))] sm:max-w-2xl",
          contentClassName
        )}
      >
        {hideHeader ? (
          <DialogTitle className="sr-only" dir="auto">{title}</DialogTitle>
        ) : (
          <DialogHeader className="shrink-0 border-b border-border px-4 py-4 pe-12 sm:px-5">
            <DialogTitle dir="auto">{title}</DialogTitle>
          </DialogHeader>
        )}
        <div className={cn("flex-1 overflow-y-auto p-4 sm:p-5", bodyClassName)}>{children}</div>
        {footer ? (
          <DialogFooter className={cn("shrink-0 border-t border-border px-4 py-3 sm:px-5", footerClassName)}>
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
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
