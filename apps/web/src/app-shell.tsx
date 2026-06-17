"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Menu,
  Search,
  Sparkles
} from "lucide-react";
import { LanguageSwitcher, ThemeToggle, useI18n } from "./i18n";
import { getCurrentSession, logout, type AnyRecord } from "./lib/api";
import { navSections, settingsNav } from "./lib/navigation";
import { warmWorkspaceQueryCache } from "./lib/query-cache";
import { sessionAuthenticatedEvent } from "./lib/session-events";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { CommandPalette } from "./components/command-palette";

const sidebarCollapsedStorageKey = "mindsystem.sidebarCollapsed";

function SidebarTooltip({
  label,
  side,
  children
}: {
  label: string;
  side: "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  label,
  collapsed,
  tooltipSide
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  collapsed: boolean;
  tooltipSide: "left" | "right";
}) {
  const link = (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-lg text-sm font-medium transition-colors",
        collapsed ? "size-10 justify-center px-0 py-0" : "gap-2.5 px-3 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <Icon className="size-[18px]" aria-hidden />
      <span className={cn(collapsed && "sr-only")}>{label}</span>
    </Link>
  );

  return collapsed ? (
    <SidebarTooltip label={label} side={tooltipSide}>
      {link}
    </SidebarTooltip>
  ) : (
    link
  );
}

function SidebarContent({
  onNavigate,
  collapsed = false,
  onToggleCollapsed
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const { t, direction } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const tooltipSide = direction === "rtl" ? "left" : "right";
  const toggleLabel = collapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar");
  const ToggleIcon = collapsed
    ? direction === "rtl"
      ? ChevronLeft
      : ChevronRight
    : direction === "rtl"
      ? ChevronRight
      : ChevronLeft;

  function isActive(href: string) {
    return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchQuery.trim();
    onNavigate?.();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <div
      className={cn(
        "flex h-full flex-col py-4",
        collapsed ? "items-center gap-4 px-2" : "gap-5 px-3"
      )}
    >
      <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5 px-2")}>
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>
        {collapsed ? null : (
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              {t("app.name")}
            </span>
            <span className="truncate text-xs text-muted-foreground">{t("app.tagline")}</span>
          </div>
        )}
        {!collapsed && onToggleCollapsed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapsed}
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            className="ms-auto text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <ToggleIcon aria-hidden />
          </Button>
        ) : null}
      </div>

      {collapsed && onToggleCollapsed ? (
        <SidebarTooltip label={toggleLabel} side={tooltipSide}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggleCollapsed}
            aria-label={toggleLabel}
            aria-expanded={!collapsed}
            className="text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
          >
            <ToggleIcon aria-hidden />
          </Button>
        </SidebarTooltip>
      ) : null}

      <div className={cn("flex flex-col gap-2", collapsed && "items-center")}>
        {collapsed ? (
          <>
            <SidebarTooltip label={t("shell.globalSearch")} side={tooltipSide}>
              <Button
                asChild
                variant="ghost"
                size="icon"
                aria-label={t("shell.globalSearch")}
                className="text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <Link href="/search" onClick={() => onNavigate?.()}>
                  <Search aria-hidden />
                </Link>
              </Button>
            </SidebarTooltip>
            <SidebarTooltip label={t("shell.quickCapture")} side={tooltipSide}>
              <Button asChild size="icon" aria-label={t("shell.quickCapture")}>
                <Link href="/inbox" onClick={() => onNavigate?.()}>
                  <Sparkles aria-hidden />
                </Link>
              </Button>
            </SidebarTooltip>
          </>
        ) : (
          <>
            <form onSubmit={submitSearch} className="relative" title={t("shell.searchHint")}>
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted-foreground" aria-hidden />
              <Input
                dir="auto"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t("shell.globalSearch")}
                aria-label={t("shell.globalSearch")}
                className="ps-9"
              />
            </form>
            <Button asChild className="w-full justify-start gap-2">
              <Link href="/inbox" onClick={() => onNavigate?.()}>
                <Sparkles aria-hidden />
                {t("shell.quickCapture")}
              </Link>
            </Button>
          </>
        )}
      </div>

      <nav
        className={cn(
          "flex flex-1 flex-col overflow-y-auto",
          collapsed ? "items-center gap-4" : "gap-5"
        )}
        aria-label={t("nav.primary")}
      >
        {navSections.map((section) => (
          <div
            key={section.labelKey}
            className={cn("flex flex-col gap-1", collapsed && "items-center")}
          >
            {collapsed ? null : (
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                {t(section.labelKey as never)}
              </p>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                active={isActive(item.href)}
                icon={item.icon}
                label={t(item.labelKey as never)}
                collapsed={collapsed}
                tooltipSide={tooltipSide}
              />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

function UserMenu({
  user,
  onLogout,
  collapsed = false
}: {
  user: AnyRecord;
  onLogout: () => void;
  collapsed?: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const userLabel = String(user.displayName ?? user.email);

  const userInitial = useMemo(() => {
    const displayName = String(user?.displayName ?? user?.email ?? "M");
    return displayName.trim().slice(0, 1).toUpperCase() || "M";
  }, [user]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center rounded-lg text-start transition-colors hover:bg-sidebar-accent/60",
            collapsed ? "size-9 justify-center p-0" : "w-full gap-2.5 px-2 py-2"
          )}
          title={collapsed ? userLabel : undefined}
          aria-label={collapsed ? userLabel : undefined}
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {userInitial}
            </AvatarFallback>
          </Avatar>
          {collapsed ? null : (
            <>
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <strong className="truncate text-sm font-medium text-sidebar-foreground">
                  {userLabel}
                </strong>
                <span className="truncate text-xs text-muted-foreground">{String(user.email ?? "")}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel>{t("nav.settings")}</DropdownMenuLabel>
        <DropdownMenuGroup>
          {settingsNav.map((item) => (
            <DropdownMenuItem key={item.href} asChild>
              <Link href={item.href} className={cn(pathname.startsWith(item.href) && "bg-accent")}>
                <item.icon aria-hidden />
                <span>{t(item.labelKey as never)}</span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onLogout} variant="destructive">
          <LogOut aria-hidden />
          <span>{t("auth.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginRoute = pathname.startsWith("/login");
  const [user, setUser] = useState<AnyRecord | null>(null);
  const [checkingSession, setCheckingSession] = useState(!isLoginRoute);
  const sessionVerified = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(sidebarCollapsedStorageKey) === "true");
  }, []);

  useEffect(() => {
    if (!user || isLoginRoute) return;
    void warmWorkspaceQueryCache();
  }, [isLoginRoute, user]);

  useEffect(() => {
    function handleSessionAuthenticated(event: Event) {
      const user = (event as CustomEvent<{ user?: AnyRecord }>).detail?.user;
      if (!user) return;

      sessionVerified.current = true;
      setUser(user);
      setCheckingSession(false);
    }

    window.addEventListener(sessionAuthenticatedEvent, handleSessionAuthenticated);
    return () => {
      window.removeEventListener(sessionAuthenticatedEvent, handleSessionAuthenticated);
    };
  }, []);

  useEffect(() => {
    if (isLoginRoute) {
      setCheckingSession(false);
      return;
    }

    if (user) {
      setCheckingSession(false);
      return;
    }

    if (sessionVerified.current) {
      setCheckingSession(false);
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }

    let active = true;
    setCheckingSession(true);
    getCurrentSession()
      .then((session) => {
        if (!active) return;
        sessionVerified.current = true;
        setUser(session.user);
        setCheckingSession(false);
      })
      .catch(() => {
        if (!active) return;
        sessionVerified.current = true;
        setUser(null);
        setCheckingSession(false);
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      });

    return () => {
      active = false;
    };
  }, [isLoginRoute, pathname, router, user]);

  async function handleLogout() {
    await logout().catch(() => null);
    sessionVerified.current = true;
    setUser(null);
    router.replace("/login");
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarCollapsedStorageKey, String(next));
      return next;
    });
  }

  if (isLoginRoute) {
    return (
      <main className="relative flex min-h-svh items-center justify-center bg-background px-4 py-10">
        <div className="absolute end-4 top-4">
          <LanguageSwitcher />
        </div>
        {children}
        <Toaster />
      </main>
    );
  }

  if (checkingSession || !user) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">
          {checkingSession ? t("auth.checkingSession") : t("auth.redirectingToLogin")}
        </p>
      </main>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-svh bg-background">
        {/* Desktop sidebar */}
        <aside
          className={cn(
            "sticky top-0 hidden h-svh shrink-0 flex-col border-e border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
            sidebarCollapsed ? "w-[68px]" : "w-[272px]"
          )}
        >
          <div className="flex-1 overflow-hidden">
            <SidebarContent
              collapsed={sidebarCollapsed}
              onToggleCollapsed={toggleSidebarCollapsed}
            />
          </div>
          <div
            className={cn(
              "flex flex-col border-t border-sidebar-border py-3",
              sidebarCollapsed ? "items-center gap-2 px-2" : "gap-3 px-3"
            )}
          >
            {sidebarCollapsed ? (
              <ThemeToggle />
            ) : (
              <div className="flex items-center justify-between px-1">
                <LanguageSwitcher />
                <ThemeToggle />
              </div>
            )}
            <UserMenu user={user} onLogout={handleLogout} collapsed={sidebarCollapsed} />
          </div>
        </aside>

        {/* Mobile slide-in */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="left" className="w-[300px] gap-0 bg-sidebar p-0" showCloseButton={false}>
            <div className="flex h-full flex-col">
              <div className="flex-1 overflow-hidden">
                <SidebarContent onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="flex flex-col gap-3 border-t border-sidebar-border px-3 py-3">
                <div className="flex items-center justify-between px-1">
                  <LanguageSwitcher />
                  <ThemeToggle />
                </div>
                <UserMenu user={user} onLogout={handleLogout} />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile topbar */}
          <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen(true)}
              aria-label={t("nav.mobileMenu")}
            >
              <Menu aria-hidden />
            </Button>
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-hidden>
                <Sparkles className="size-4" />
              </span>
              <span className="text-sm font-semibold">{t("app.name")}</span>
            </Link>
            <div className="ms-auto flex items-center gap-1">
              <ThemeToggle />
              <Button asChild variant="ghost" size="icon" aria-label={t("shell.quickCapture")}>
                <Link href="/inbox">
                  <Sparkles aria-hidden />
                </Link>
              </Button>
            </div>
          </header>

          <main className="flex-1">
            <div className="w-full px-3 py-4 sm:px-4 lg:px-5 lg:py-6 2xl:px-6">
              {children}
            </div>
          </main>
        </div>

        <Toaster />
        <CommandPalette />
      </div>
    </TooltipProvider>
  );
}
