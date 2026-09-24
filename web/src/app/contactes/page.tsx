"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizationId } from "@/components/shell";
import { api } from "@/lib/api";

interface Contact {
  id: string;
  legalName: string;
  taxId: string;
  email: string;
  role: "CLIENT" | "SUPPLIER";
}

export default function ContactsPage() {
  const organizationId = useOrganizationId();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"CLIENT" | "SUPPLIER">("CLIENT");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`);
      setContacts(body.contacts);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'han pogut carregar els contactes");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  async function createContact(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api(`/organizations/${organizationId}/contacts`, {
        method: "POST",
        body: JSON.stringify({ legalName, taxId, email, role }),
      });
      setLegalName("");
      setTaxId("");
      setEmail("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut crear el contacte");
    }
  }

  if (!organizationId) return <p className="text-sm text-muted-foreground">Crea l'organització per afegir contactes.</p>;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Contactes</h1>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={createContact}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Raó social</Label>
          <Input id="name" value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tax">NIF</Label>
          <Input id="tax" value={taxId} onChange={(event) => setTaxId(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Correu</Label>
          <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">Rol</Label>
          <select id="role" className="h-8 rounded-lg border bg-background px-2 text-sm" value={role} onChange={(event) => setRole(event.target.value as "CLIENT" | "SUPPLIER")}>
            <option value="CLIENT">Client</option>
            <option value="SUPPLIER">Proveïdor</option>
          </select>
        </div>
        <Button type="submit">Afegeix el contacte</Button>
      </form>
      {loading ? <p className="text-sm text-muted-foreground">Carregant contactes…</p> : null}
      {!loading && contacts.length === 0 ? <p className="text-sm text-muted-foreground">Encara no hi ha clients ni proveïdors.</p> : null}
      <ul className="flex flex-col gap-2">
        {contacts.map((contact) => (
          <li key={contact.id} className="rounded-lg border p-3">
            <p className="font-medium">{contact.legalName}</p>
            <p className="text-sm text-muted-foreground">{contact.role === "CLIENT" ? "Client" : "Proveïdor"} · {contact.taxId} · {contact.email}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
