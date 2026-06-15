"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bot, ClipboardList, Database, FileText, Home, Inbox, ListTodo, LogOut, Search, Settings, Tags } from "lucide-react";
import { LanguageSwitcher, useI18n } from "./i18n";
import { getCurrentSession, logout, type AnyRecord } from "./lib/api";

const navItems = [
  ["/dashboard", "nav.dashboard", Home],
  ["/inbox", "nav.inbox", Inbox],
  ["/projects", "nav.projects", Tags],
  ["/tasks", "nav.tasks", ListTodo],
  ["/notes", "nav.notes", FileText],
  ["/documents", "nav.documents", Database],
  ["/review", "nav.review", ClipboardList],
  ["/search", "nav.search", Search],
  ["/agents", "nav.agents", Bot],
  ["/admin/schemas", "nav.schemas", Settings]
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname.startsWith("/login");
  const [user, setUser] = useState<AnyRecord | null>(null);
  const [checkingSession, setCheckingSession] = useState(!isLoginRoute);

  useEffect(() => {
    if (isLoginRoute) {
      setCheckingSession(false);
      return;
    }

    let active = true;
    setCheckingSession(true);
    getCurrentSession()
      .then((session) => {
        if (!active) return;
        setUser(session.user);
        setCheckingSession(false);
      })
      .catch(() => {
        if (!active) return;
        setUser(null);
        setCheckingSession(false);
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      });

    return () => {
      active = false;
    };
  }, [isLoginRoute, pathname, router]);

  async function handleLogout() {
    await logout().catch(() => null);
    setUser(null);
    router.replace("/login");
  }

  if (isLoginRoute) {
    return (
      <main className="auth-main">
        <div className="auth-language">
          <LanguageSwitcher />
        </div>
        {children}
      </main>
    );
  }

  if (checkingSession) {
    return (
      <main className="auth-main">
        <div className="auth-card compact">
          <p className="row-title">{t("auth.checkingSession")}</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-main">
        <div className="auth-card compact">
          <p className="row-title">{t("auth.redirectingToLogin")}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span>{t("app.name")}</span>
          <small>{t("app.tagline")}</small>
        </div>
        <LanguageSwitcher />
        <nav className="nav-list" aria-label={t("nav.primary")}>
          {navItems.map(([href, labelKey, Icon]) => (
            <Link key={href} className="nav-link" href={href}>
              <Icon size={17} aria-hidden />
              <span>{t(labelKey)}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          {user ? (
            <div className="signed-in-user">
              <span>{user.displayName}</span>
              <small>{user.email}</small>
            </div>
          ) : null}
          <button className="nav-link nav-button" type="button" onClick={handleLogout}>
            <LogOut size={17} aria-hidden />
            <span>{t("auth.logout")}</span>
          </button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
