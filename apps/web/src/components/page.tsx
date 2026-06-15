"use client";

import { useI18n } from "../i18n";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title" dir="auto">{title}</h1>
        {subtitle ? <p className="page-subtitle" dir="auto">{subtitle}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2 className="panel-title" dir="auto">{title}</h2>
        {action}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PriorityBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  const className = value === "urgent" ? "badge urgent" : value === "high" ? "badge high" : "badge";
  return <span className={className}>{translateValue("priority", value ?? "medium")}</span>;
}

export function StatusBadge({ value }: { value?: string | null }) {
  const { translateValue } = useI18n();
  return <span className={value === "done" || value === "completed" ? "badge done" : "badge"}>{translateValue("status", value ?? "active")}</span>;
}
