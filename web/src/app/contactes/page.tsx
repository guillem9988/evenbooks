"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOrganizationId } from "@/components/shell";
import { EmptyState, ErrorBanner, Field, LoadingRows, NativeSelect, Notice, PageHeader, StatusBadge, messageOf } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Role = "CLIENT" | "SUPPLIER";

interface Contact {
  id: string;
  legalName: string;
  taxId: string;
  email: string;
  role: Role;
}

export default function ContactsPage() {
  const organizationId = useOrganizationId();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<Role | "ALL">("ALL");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("CLIENT");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`);
      setContacts(body.contacts);
    } catch (cause) {
      setError(messageOf(cause, "No s'han pogut carregar els contactes"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (filter === "ALL" ? contacts : contacts.filter((contact) => contact.role === filter)),
    [contacts, filter],
  );

  async function createContact(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/contacts`, {
        method: "POST",
        body: JSON.stringify({ legalName, taxId, email, role }),
      });
      setNotice(`${legalName} afegit com a ${role === "CLIENT" ? "client" : "proveïdor"}.`);
      setLegalName("");
      setTaxId("");
      setEmail("");
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut crear el contacte"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Contactes" description="Clients i proveïdors amb el seu NIF, per facturar i classificar despeses." />
      <ErrorBanner message={error} onRetry={load} />
      <Notice message={notice} />
      <Card>
        <CardHeader>
          <CardTitle>Nou contacte</CardTitle>
          <CardDescription>Els clients apareixen a Ingressos i Pressupostos.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={createContact}>
            <Field id="contact-name" label="Raó social">
              <Input id="contact-name" value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
            </Field>
            <Field id="contact-tax" label="NIF / CIF">
              <Input id="contact-tax" value={taxId} onChange={(event) => setTaxId(event.target.value)} required />
            </Field>
            <Field id="contact-email" label="Correu">
              <Input id="contact-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field id="contact-role" label="Rol">
              <NativeSelect id="contact-role" value={role} onChange={(event) => setRole(event.target.value as Role)}>
                <option value="CLIENT">Client</option>
                <option value="SUPPLIER">Proveïdor</option>
              </NativeSelect>
            </Field>
            <Button type="submit" className="sm:col-span-2 lg:col-span-4 lg:justify-self-end" disabled={busy}>
              {busy ? "Desant…" : "Afegeix el contacte"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Llista</h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label="Filtra per rol">
            {(
              [
                ["ALL", "Tots"],
                ["CLIENT", "Clients"],
                ["SUPPLIER", "Proveïdors"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={cn("rounded-md px-3 py-1", filter === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <LoadingRows />
        ) : visible.length === 0 ? (
          <EmptyState title="Encara no hi ha contactes" hint="Afegeix el primer client o proveïdor amb el formulari." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {visible.map((contact) => (
              <li key={contact.id} className="flex flex-col gap-1 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{contact.legalName}</p>
                  <StatusBadge tone={contact.role === "CLIENT" ? "success" : "neutral"}>
                    {contact.role === "CLIENT" ? "Client" : "Proveïdor"}
                  </StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">{contact.taxId}</p>
                <p className="truncate text-sm text-muted-foreground">{contact.email}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
