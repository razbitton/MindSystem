"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Menu,
  Sparkles
} from "lucide-react";
import { LanguageSwitcher, ThemeToggle, useI18n } from "./i18n";
import { logout, type AnyRecord } from "./lib/api";
import { navSections, settingsNav } from "./lib/navigation";
import { prefetchDataForRoute } from "./lib/query-cache";
import { BrandLogo } from "./components/brand-logo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
  tooltipSide,
  onNavigate
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  collapsed: boolean;
  tooltipSide: "left" | "right";
  onNavigate?: () => void;
}) {
  function prefetch() {
    void prefetchDataForRoute(href);
  }

  const link = (
    <Link
      href={href}
      prefetch={false}
      onClick={() => onNavigate?.()}
      onFocus={prefetch}
      onMouseEnter={prefetch}
      data-active={active ? "true" : undefined}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "interactive-sidebar-tab group/nav flex items-center rounded-lg text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/45",
        collapsed ? "size-10 justify-center px-0 py-0" : "gap-2.5 px-3 py-2",
        active
          ? "bg-sidebar-accent/85 text-sidebar-accent-foreground shadow-sm"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      <Icon
        className={cn(
          "size-[18px] transition-[color,transform] duration-200 group-hover/nav:scale-110",
          active ? "text-sidebar-primary" : "text-sidebar-foreground/55 group-hover/nav:text-sidebar-primary"
        )}
        aria-hidden
      />
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

  return (
    <div
      className={cn(
        "flex h-full flex-col py-4",
        collapsed ? "items-center gap-4 px-2" : "gap-5 px-3"
      )}
    >
      <div className={cn("flex items-center", collapsed ? "justify-center" : "gap-2.5 px-2")}>
        <BrandLogo className="size-9 rounded-lg" />
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
                {...(onNavigate ? { onNavigate } : {})}
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

export function AuthenticatedShell({
  children,
  user
}: {
  children: React.ReactNode;
  user: AnyRecord;
}) {
  const { t, direction } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setCurrentUser(user);
  }, [user]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem(sidebarCollapsedStorageKey) === "true");
  }, []);

  async function handleLogout() {
    await logout().catch(() => null);
    router.replace("/login");
    router.refresh();
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(sidebarCollapsedStorageKey, String(next));
      return next;
    });
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
            <UserMenu user={currentUser} onLogout={handleLogout} collapsed={sidebarCollapsed} />
          </div>
        </aside>

        {/* Mobile slide-in */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent
            side={direction === "rtl" ? "right" : "left"}
            className="w-[300px] gap-0 bg-sidebar p-0"
            showCloseButton={false}
          >
            <div className="flex h-full flex-col">
              <div className="flex-1 overflow-hidden">
                <SidebarContent onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="flex flex-col gap-3 border-t border-sidebar-border px-3 py-3">
                <div className="flex items-center justify-between px-1">
                  <LanguageSwitcher />
                  <ThemeToggle />
                </div>
                <UserMenu user={currentUser} onLogout={handleLogout} />
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
              <BrandLogo className="size-7 rounded-md" />
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
