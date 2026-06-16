"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bot,
  ChevronUp,
  ClipboardCheck,
  Database,
  FileText,
  FolderKanban,
  Home,
  Inbox,
  LogOut,
  Menu,
  PanelLeftClose,
  Search,
  Settings,
  Sparkles,
  StickyNote,
  X
} from "lucide-react";
import { IconButton } from "./components/page";
import { LanguageSwitcher, useI18n } from "./i18n";
import { getCurrentSession, logout, type AnyRecord } from "./lib/api";

const navSections = [
  {
    labelKey: "nav.workspace",
    items: [
      ["/dashboard", "nav.home", Home],
      ["/inbox", "nav.inbox", Inbox],
      ["/search", "nav.search", Search]
    ]
  },
  {
    labelKey: "nav.library",
    items: [
      ["/notes", "nav.notes", StickyNote],
      ["/tasks", "nav.tasks", ClipboardCheck],
      ["/projects", "nav.projects", FolderKanban],
      ["/documents", "nav.documents", FileText]
    ]
  },
  {
    labelKey: "nav.automation",
    items: [
      ["/review", "nav.review", Database],
      ["/agents", "nav.agents", Bot]
    ]
  },
  {
    labelKey: "nav.admin",
    items: [["/admin/schemas", "nav.schemas", Settings]]
  }
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname.startsWith("/login");
  const [user, setUser] = useState<AnyRecord | null>(null);
  const [checkingSession, setCheckingSession] = useState(!isLoginRoute);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

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

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchQuery.trim();
    if (!q) {
      router.push("/search");
      return;
    }
    router.push(`/search?q=${encodeURIComponent(q)}`);
  }

  const userInitial = useMemo(() => {
    const displayName = String(user?.displayName ?? user?.email ?? "M");
    return displayName.trim().slice(0, 1).toUpperCase() || "M";
  }, [user]);

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
      <div className="mobile-topbar">
        <IconButton label={menuOpen ? t("nav.closeMenu") : t("nav.mobileMenu")} onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X size={19} aria-hidden /> : <Menu size={19} aria-hidden />}
        </IconButton>
        <div className="mobile-brand">
          <span className="brand-mark" aria-hidden>
            <Sparkles size={18} />
          </span>
          <span>{t("app.name")}</span>
        </div>
        <Link className="icon-button" href="/inbox" title={t("shell.quickCapture")} aria-label={t("shell.quickCapture")}>
          <Inbox size={18} aria-hidden />
        </Link>
      </div>
      {menuOpen ? <button className="sidebar-backdrop" type="button" aria-label={t("nav.closeMenu")} onClick={() => setMenuOpen(false)} /> : null}
      <aside className={menuOpen ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <Sparkles size={20} />
          </span>
          <div className="brand-text">
            <span>{t("app.name")}</span>
            <small>{t("app.tagline")}</small>
          </div>
        </div>
        <div className="sidebar-search">
          <form className="shell-search" onSubmit={submitSearch} title={t("shell.searchHint")}>
            <Search size={16} aria-hidden />
            <input
              dir="auto"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("shell.globalSearch")}
              aria-label={t("shell.globalSearch")}
            />
          </form>
          <Link className="button primary" href="/inbox">
            <Inbox size={16} aria-hidden />
            {t("shell.quickCapture")}
          </Link>
        </div>
        <nav className="nav-scroll" aria-label={t("nav.primary")}>
          {navSections.map((section) => (
            <div className="nav-section" key={section.labelKey}>
              <p className="nav-section-label">{t(section.labelKey)}</p>
              <div className="nav-list">
                {section.items.map(([href, labelKey, Icon]) => {
                  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
                  return (
                    <Link key={href} className={active ? "nav-link active" : "nav-link"} href={href}>
                      <Icon size={17} aria-hidden />
                      <span>{t(labelKey)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitcher />
          <div className="user-menu">
            <button className="user-button" type="button" onClick={() => setUserMenuOpen((open) => !open)}>
              <span className="user-avatar" aria-hidden>{userInitial}</span>
              <span className="user-copy">
                <strong>{user.displayName}</strong>
                <span>{user.email}</span>
              </span>
              <ChevronUp size={15} aria-hidden />
            </button>
            {userMenuOpen ? (
              <div className="user-popover">
                <button className="nav-link nav-button" type="button" onClick={handleLogout}>
                  <LogOut size={17} aria-hidden />
                  <span>{t("auth.logout")}</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="content-wrap">{children}</div>
      </main>
    </div>
  );
}
