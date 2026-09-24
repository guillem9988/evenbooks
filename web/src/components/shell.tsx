"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ORG_KEY } from "@/lib/api";

const LINKS = [
  ["/", "Inici"],
  ["/ingressos", "Ingressos"],
  ["/pressupostos", "Pressupostos"],
  ["/despeses", "Despeses"],
  ["/banc", "Banc"],
  ["/impostos", "Impostos"],
  ["/contactes", "Contactes"],
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [organizationId, setOrganizationId] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrganizationId(window.localStorage.getItem(ORG_KEY) ?? "");
  }, []);

  async function createOrganization(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await api<{ id: string }>("/organizations", {
        method: "POST",
        body: JSON.stringify({ legalName, taxId }),
      });
      window.localStorage.setItem(ORG_KEY, created.id);
      setOrganizationId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut crear l'organització");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-background">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">MatchInvoice</p>
              <p className="text-lg font-semibold">Facturació i impostos</p>
            </div>
            <p className="break-all font-mono text-xs text-muted-foreground">
              {organizationId || "Cap organització"}
            </p>
          </div>
          <nav className="flex gap-2 overflow-x-auto pb-1">
            {LINKS.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${pathname === href ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <form className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" onSubmit={createOrganization}>
            <Input placeholder="Raó social" value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
            <Input placeholder="NIF" value={taxId} onChange={(event) => setTaxId(event.target.value)} required />
            <Button type="submit" disabled={busy}>{busy ? "Creant…" : "Crea l'organització"}</Button>
          </form>
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}

export function useOrganizationId(): string {
  const [organizationId, setOrganizationId] = useState("");
  useEffect(() => {
    setOrganizationId(window.localStorage.getItem(ORG_KEY) ?? "");
  }, []);
  return organizationId;
}
