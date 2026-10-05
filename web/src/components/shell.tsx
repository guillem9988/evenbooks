"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogOutIcon, MenuIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { AuthScreen } from "@/components/auth-screen";
import { CommandPalette } from "@/components/command-palette";
import { ALL_NAV_LINKS, NAV_GROUPS } from "@/components/nav";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { OrganizationProvider, useOrganization } from "@/components/organization";
import { ThemeProvider, ThemeSwitcher } from "@/components/theme";
import { VerifyEmailBanner } from "@/components/verify-email";
import { notifyError } from "@/components/ui-kit";
import { I18nProvider, useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <OrganizationProvider>
          <ShellInner>{children}</ShellInner>
        </OrganizationProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <a
        href="#contingut"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium shadow focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("common.skipToContent")}
      </a>
      <Frame>{children}</Frame>
      <Toaster position="top-right" richColors closeButton />
    </>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const { ready, organizationId, emailVerified } = useOrganization();
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [organizationId]);

  // Pages that must work whether or not the person is signed in: the emailed verification link and the privacy policy.
  if (pathname === "/verifica" || pathname === "/privacitat") {
    return <>{children}</>;
  }

  if (!ready) {
    return <LoadingSession />;
  }

  if (!organizationId) {
    const isRegister = pathname === "/registre" || pathname === "/register";
    return <AuthScreen initialMode={isRegister ? "register" : "login"} />;
  }

  const openPalette = () => setPaletteOpen(true);

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <aside className="hidden border-r border-sidebar-border bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col">
        <div className="flex flex-col gap-4 px-4 pt-5 pb-3">
          <Brand />
          <SearchButton onClick={openPalette} />
        </div>
        <Navigation className="flex-1 overflow-y-auto px-3 pb-3" />
        <Account className="border-t border-sidebar-border p-3" />
      </aside>
      <MobileBar onSearch={openPalette} />
      <main id="contingut" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 animate-in fade-in duration-300" key={pathname}>
          {emailVerified ? null : <VerifyEmailBanner />}
          {children}
        </div>
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

function SearchButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-keyshortcuts="Control+K Meta+K"
      className="flex h-9 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background px-2.5 text-sm text-muted-foreground shadow-xs outline-none transition-colors hover:border-ring/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <SearchIcon className="size-4" aria-hidden />
      <span className="flex-1 truncate text-left">{t("command.open")}</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-none" aria-hidden>
        Ctrl K
      </kbd>
    </button>
  );
}

function LoadingSession() {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, []);

  // A cold API can take ~30-50 s. The bar eases towards 95% so it keeps moving without promising a time.
  const progress = Math.min(95, 100 * (1 - Math.exp(-elapsed / 18)));

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row" aria-busy="true" aria-label={t("common.loadingSession")}>
      <div className="hidden w-64 shrink-0 border-r bg-sidebar p-4 md:block">
        <Skeleton className="h-8 w-40" />
        <div className="mt-8 flex flex-col gap-2">
          {Array.from({ length: 9 }, (_, index) => (
            <Skeleton key={index} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-6 lg:p-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-6 h-32 w-full" />
        {elapsed >= 2.5 ? (
          <div className="mx-auto mt-10 flex max-w-xs flex-col items-center gap-4 rounded-2xl border bg-card p-6 text-center shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-500">
            <Logo className="size-11 animate-pulse" />
            <p role="status" className="font-semibold">
              {t("common.wakeLoading")}
            </p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Brand() {
  const t = useT();
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <Logo />
      <span className="leading-tight">
        <span className="block text-sm font-semibold tracking-tight">MatchInvoice</span>
        <span className="block text-xs text-muted-foreground">{t("brand.tagline")}</span>
      </span>
    </Link>
  );
}

function Navigation({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav aria-label={t("common.mainNav")} className={cn("flex flex-col gap-4", className)}>
      {NAV_GROUPS.map((group) => (
        <div key={group.labelKey ?? "inici"} className="flex flex-col gap-0.5">
          {group.labelKey ? <p className="px-3 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">{t(group.labelKey)}</p> : null}
          {group.links.map(({ href, labelKey, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/nav relative flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {active ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" aria-hidden /> : null}
                <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground group-hover/nav:text-foreground")} aria-hidden />
                {t(labelKey)}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Account({ className }: { className?: string }) {
  const { organizationId, organizationName, displayName, avatarUrl, clear } = useOrganization();
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-2">
        <LanguageSwitcher className="h-8 min-w-0 flex-1 text-xs" />
        <ThemeSwitcher className="w-24 shrink-0" />
      </div>
      <Link href="/privacitat" className="px-1 text-[11px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {t("common.privacy")}
      </Link>
      <div className="flex items-center gap-2">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            referrerPolicy="no-referrer"
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary uppercase" aria-hidden>
            {(displayName || organizationName || "?").slice(0, 1)}
          </span>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium" title={organizationId}>
            {organizationName || t("common.organization")}
          </p>
          {displayName ? <p className="truncate text-xs text-muted-foreground">{displayName}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("common.logout")}
          title={t("common.logout")}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/auth/logout", { method: "POST" });
            } catch (cause) {
              notifyError(cause, t("common.logoutFailed"));
            } finally {
              setBusy(false);
              clear();
            }
          }}
        >
          <LogOutIcon />
        </Button>
      </div>
    </div>
  );
}

function MobileBar({ onSearch }: { onSearch: () => void }) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const labels = useMemo(() => Object.fromEntries(ALL_NAV_LINKS.map((link) => [link.href, t(link.labelKey)])), [t]);
  const currentLabel = labels[pathname];
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
      <Button type="button" variant="ghost" size="icon" aria-label={t("common.menu")} aria-expanded={open} onClick={() => setOpen(true)}>
        <MenuIcon />
      </Button>
      <p className="flex-1 truncate text-sm font-semibold">{currentLabel ?? "MatchInvoice"}</p>
      <Button type="button" variant="ghost" size="icon" aria-label={t("command.open")} onClick={onSearch}>
        <SearchIcon />
      </Button>
      <Logo className="size-7" />
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b">
            <SheetTitle className="sr-only">{t("common.menu")}</SheetTitle>
            <SheetDescription className="sr-only">{t("common.menuDescription")}</SheetDescription>
            <Brand />
          </SheetHeader>
          <Navigation className="flex-1 overflow-y-auto p-3" onNavigate={() => setOpen(false)} />
          <Account className="border-t p-3" />
        </SheetContent>
      </Sheet>
    </header>
  );
}

export function useOrganizationId(): string {
  return useOrganization().organizationId;
}
