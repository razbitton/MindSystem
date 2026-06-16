"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsUpDown,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  X
} from "lucide-react";
import { LanguageSwitcher, ThemeToggle, useI18n } from "./i18n";
import { getCurrentSession, logout, type AnyRecord } from "./lib/api";
import { navSections, settingsNav } from "./lib/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
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

function NavLink({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      )}
    >
      {children}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

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
    <div className="flex h-full flex-col gap-5 px-3 py-4">
      <div className="flex items-center gap-2.5 px-2">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground" aria-hidden>
          <Sparkles className="size-5" />
        </span>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold text-sidebar-foreground">{t("app.name")}</span>
          <span className="text-xs text-muted-foreground">{t("app.tagline")}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
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
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto" aria-label={t("nav.primary")}>
        {navSections.map((section) => (
          <div key={section.labelKey} className="flex flex-col gap-1">
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
              {t(section.labelKey as never)}
            </p>
            {section.items.map((item) => (
              <NavLink key={item.href} href={item.href} active={isActive(item.href)}>
                <item.icon className="size-[18px]" aria-hidden />
                <span>{t(item.labelKey as never)}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

function UserMenu({ user, onLogout }: { user: AnyRecord; onLogout: () => void }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const userInitial = useMemo(() => {
    const displayName = String(user?.displayName ?? user?.email ?? "M");
    return displayName.trim().slice(0, 1).toUpperCase() || "M";
  }, [user]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-start transition-colors hover:bg-sidebar-accent/60">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {userInitial}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <strong className="truncate text-sm font-medium text-sidebar-foreground">
              {String(user.displayName ?? user.email)}
            </strong>
            <span className="truncate text-xs text-muted-foreground">{String(user.email ?? "")}</span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
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
    <div className="flex min-h-svh bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-svh w-[272px] shrink-0 flex-col border-e border-sidebar-border bg-sidebar lg:flex">
        <div className="flex-1 overflow-hidden">
          <SidebarContent />
        </div>
        <div className="flex flex-col gap-3 border-t border-sidebar-border px-3 py-3">
          <div className="flex items-center justify-between px-1">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <UserMenu user={user} onLogout={handleLogout} />
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
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>

      <Toaster />
      <CommandPalette />
    </div>
  );
}
