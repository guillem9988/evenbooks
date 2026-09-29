"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BanknoteIcon,
  FileTextIcon,
  HouseIcon,
  LandmarkIcon,
  LogOutIcon,
  MenuIcon,
  PackageIcon,
  ReceiptIcon,
  RepeatIcon,
  ScaleIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { AuthScreen } from "@/components/auth-screen";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OrganizationProvider, useOrganization } from "@/components/organization";
import { notifyError } from "@/components/ui-kit";
import { I18nProvider, useT } from "@/i18n";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  labelKey: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

const GROUPS: Array<{ labelKey: string | null; links: NavLink[] }> = [
  {
    labelKey: null,
    links: [{ href: "/", labelKey: "nav.home", icon: HouseIcon }],
  },
  {
    labelKey: "nav.groupSales",
    links: [
      { href: "/ingressos", labelKey: "nav.income", icon: BanknoteIcon },
      { href: "/pressupostos", labelKey: "nav.quotes", icon: FileTextIcon },
      { href: "/recurrents", labelKey: "nav.recurring", icon: RepeatIcon },
      { href: "/cataleg", labelKey: "nav.catalog", icon: PackageIcon },
    ],
  },
  {
    labelKey: "nav.groupPurchases",
    links: [
      { href: "/despeses", labelKey: "nav.expenses", icon: ReceiptIcon },
      { href: "/banc", labelKey: "nav.bank", icon: LandmarkIcon },
    ],
  },
  {
    labelKey: "nav.groupManage",
    links: [
      { href: "/impostos", labelKey: "nav.taxes", icon: ScaleIcon },
      { href: "/contactes", labelKey: "nav.contacts", icon: UsersIcon },
      { href: "/configuracio", labelKey: "nav.settings", icon: SettingsIcon },
    ],
  },
];

const ALL_LINKS = GROUPS.flatMap((group) => group.links);

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <OrganizationProvider>
        <ShellInner>{children}</ShellInner>
      </OrganizationProvider>
    </I18nProvider>
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
  const { ready, organizationId } = useOrganization();
  const t = useT();

  if (!ready) {
    return <LoadingSession />;
  }

  if (!organizationId) {
    return <AuthScreen />;
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col md:flex-row">
      <aside className="hidden border-r bg-sidebar md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col">
        <div className="px-4 pt-5 pb-4">
          <Brand />
        </div>
        <Navigation className="flex-1 overflow-y-auto px-3" />
        <Account className="border-t p-3" />
      </aside>
      <MobileBar />
      <main id="contingut" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

function LoadingSession() {
  const t = useT();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(timer);
  }, []);

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
        {slow ? (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border/80 bg-muted/40 p-4 text-sm text-muted-foreground shadow-xs animate-in fade-in duration-500">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-amber-500" />
            </span>
            <p className="leading-snug">{t("common.wakingServer")}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Brand() {
  const t = useT();
  return (
    <Link href="/" className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
        MI
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">MatchInvoice</span>
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
      {GROUPS.map((group) => (
        <div key={group.labelKey ?? "inici"} className="flex flex-col gap-0.5">
          {group.labelKey ? <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{t(group.labelKey)}</p> : null}
          {group.links.map(({ href, labelKey, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-primary font-medium text-primary-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
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
  const { organizationId, organizationName, displayName, clear } = useOrganization();
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <LanguageSwitcher className="h-8 w-full text-xs" />
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase" aria-hidden>
          {(displayName || organizationName || "?").slice(0, 1)}
        </span>
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

function MobileBar() {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const labels = useMemo(() => Object.fromEntries(ALL_LINKS.map((link) => [link.href, t(link.labelKey)])), [t]);
  const currentLabel = labels[pathname];
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:hidden">
      <Button type="button" variant="ghost" size="icon" aria-label={t("common.menu")} aria-expanded={open} onClick={() => setOpen(true)}>
        <MenuIcon />
      </Button>
      <p className="flex-1 truncate text-sm font-semibold">{currentLabel ?? "MatchInvoice"}</p>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
        MI
      </span>
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
