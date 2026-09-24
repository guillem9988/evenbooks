"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BanknoteIcon,
  Building2Icon,
  FileTextIcon,
  HouseIcon,
  LandmarkIcon,
  ReceiptIcon,
  ScaleIcon,
  UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OrganizationProvider, useOrganization } from "@/components/organization";
import { ErrorBanner, Field, LoadingRows, messageOf } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Inici", icon: HouseIcon },
  { href: "/ingressos", label: "Ingressos", icon: BanknoteIcon },
  { href: "/pressupostos", label: "Pressupostos", icon: FileTextIcon },
  { href: "/despeses", label: "Despeses", icon: ReceiptIcon },
  { href: "/banc", label: "Banc", icon: LandmarkIcon },
  { href: "/impostos", label: "Impostos", icon: ScaleIcon },
  { href: "/contactes", label: "Contactes", icon: UsersIcon },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <OrganizationProvider>
      <Frame>{children}</Frame>
    </OrganizationProvider>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { ready, organizationId, organizationName, clear } = useOrganization();

  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="border-b bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:flex-col md:items-start md:py-5">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              MI
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">MatchInvoice</p>
              <p className="text-xs text-muted-foreground">Gestió per a autònoms</p>
            </div>
          </div>
          {organizationId ? (
            <div className="flex min-w-0 items-center gap-2 md:mt-4 md:w-full md:rounded-lg md:border md:bg-background md:p-2">
              <Building2Icon className="hidden size-4 shrink-0 text-muted-foreground md:block" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium" title={organizationId}>
                  {organizationName || "Organització"}
                </p>
                <button type="button" className="text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={clear}>
                  Canvia
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:pb-0">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {!ready ? <LoadingRows rows={4} /> : organizationId ? children : <Onboarding />}
        </div>
      </main>
    </div>
  );
}

function Onboarding() {
  const { select } = useOrganization();
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string; legalName: string }>("/organizations", {
        method: "POST",
        body: JSON.stringify({ legalName, taxId }),
      });
      select(created.id, created.legalName);
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut crear l'organització"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle>Comencem per la teva empresa</CardTitle>
        <CardDescription>
          Indica la raó social i el NIF. Es desa en aquest navegador i s’utilitza a totes les seccions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <Field id="org-name" label="Raó social">
            <Input id="org-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Estudi Vidal SL" required />
          </Field>
          <Field id="org-tax" label="NIF / CIF">
            <Input id="org-tax" value={taxId} onChange={(event) => setTaxId(event.target.value)} placeholder="B12345678" required />
          </Field>
          <ErrorBanner message={error} />
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? "Creant…" : "Crea l'organització"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function useOrganizationId(): string {
  return useOrganization().organizationId;
}
