"use client";

import { X } from "lucide-react";
import { useI18n } from "../i18n";

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
    <header className="page-header">
      <div className="page-heading">
        {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
        <h1 className="page-title" dir="auto">{title}</h1>
        {subtitle ? <p className="page-subtitle" dir="auto">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

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
    <section className={`panel ${className}`.trim()}>
      {title || action ? (
        <div className="panel-header">
          {title ? <h2 className="panel-title" dir="auto">{title}</h2> : <span />}
          {action ? <div className="panel-action">{action}</div> : null}
        </div>
      ) : null}
      <div className="panel-body">{children}</div>
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
    <div className="empty">
      {title ? <p className="empty-title" dir="auto">{title}</p> : null}
      <div className="empty-copy" dir="auto">{children}</div>
      {action ? <div>{action}</div> : null}
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
    <button className={`icon-button ${className}`.trim()} title={label} aria-label={label} {...props}>
      {children}
    </button>
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
    <div className="segmented-control" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? "segment active" : "segment"}
          type="button"
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

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
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="drawer-layer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button className="drawer-backdrop" type="button" aria-label={t("common.close")} onClick={onClose} />
      <aside className="drawer-panel">
        <div className="drawer-header">
          <div>
            <h2 id="drawer-title" dir="auto">{title}</h2>
            {subtitle ? <p dir="auto">{subtitle}</p> : null}
          </div>
          <IconButton label={t("common.close")} onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-footer">{footer}</div> : null}
      </aside>
    </div>
  );
}

export function PriorityBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  const tone = value === "urgent" ? "danger" : value === "high" ? "warning" : value === "low" ? "quiet" : "info";
  return <span className={`badge ${tone}`}>{translateValue("priority", value ?? "medium")}</span>;
}

export function StatusBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  const tone =
    value === "done" || value === "completed" || value === "approved"
      ? "success"
      : value === "waiting" || value === "pending" || value === "review"
        ? "warning"
        : value === "failed" || value === "cancelled" || value === "rejected"
          ? "danger"
          : "neutral";
  return <span className={`badge ${tone}`}>{translateValue("status", value ?? "active")}</span>;
}

export function EntityBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  return <span className={`badge entity-${value ?? "entity"}`}>{translateValue("entity", value ?? "note")}</span>;
}

export function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="meta-item">
      <span>{label}</span>
      <strong dir="auto">{value}</strong>
    </span>
  );
}
