"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizationId } from "@/components/shell";
import { api } from "@/lib/api";
import { euros, parseEuroInput } from "@/lib/money";

interface Contact {
  id: string;
  legalName: string;
  role: string;
}

interface IssuedInvoice {
  id: string;
  seriesNumber: string;
  invoiceDate: string;
  status: string;
  contactName: string;
  totalAmountCents: string;
}

export default function IncomePage() {
  const organizationId = useOrganizationId();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([]);
  const [contactId, setContactId] = useState("");
  const [seriesNumber, setSeriesNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("2026-09-01");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [taxRate, setTaxRate] = useState("21");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [people, issued] = await Promise.all([
        api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
        api<{ issuedInvoices: IssuedInvoice[] }>(`/organizations/${organizationId}/issued-invoices`),
      ]);
      setContacts(people.contacts.filter((contact) => contact.role === "CLIENT"));
      setInvoices(issued.issuedInvoices);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'han pogut carregar les factures");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault();
    const unitAmountCents = parseEuroInput(price);
    if (unitAmountCents === null) {
      setError("El preu ha de ser un import en euros, per exemple 100,00");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/issued-invoices`, {
        method: "POST",
        body: JSON.stringify({
          contactId,
          invoiceDate,
          seriesNumber,
          lines: [{ description, quantity: Number(quantity), unitAmountCents, taxRate: Number(taxRate) }],
        }),
      });
      setSeriesNumber("");
      setDescription("");
      setPrice("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut crear la factura");
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(invoice: IssuedInvoice, paid: boolean) {
    setError(null);
    try {
      await api(`/organizations/${organizationId}/issued-invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ paid }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut actualitzar l'estat");
    }
  }

  if (!organizationId) return <p className="text-sm text-muted-foreground">Crea l'organització per emetre factures.</p>;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Factures emeses</h1>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={createInvoice}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact">Client</Label>
          <select id="contact" className="h-8 rounded-lg border bg-background px-2 text-sm" value={contactId} onChange={(event) => setContactId(event.target.value)} required>
            <option value="">Tria un client</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.legalName}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="series">Número de sèrie</Label>
          <Input id="series" value={seriesNumber} onChange={(event) => setSeriesNumber(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Data</Label>
          <Input id="date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Concepte</Label>
          <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quantity">Quantitat</Label>
          <Input id="quantity" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Preu unitari</Label>
          <Input id="price" placeholder="100,00" value={price} onChange={(event) => setPrice(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate">IVA</Label>
          <select id="rate" className="h-8 rounded-lg border bg-background px-2 text-sm" value={taxRate} onChange={(event) => setTaxRate(event.target.value)}>
            <option value="21">21%</option>
            <option value="10">10%</option>
            <option value="4">4%</option>
            <option value="0">0%</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy}>{busy ? "Desant…" : "Crea la factura"}</Button>
        </div>
      </form>
      {loading ? <p className="text-sm text-muted-foreground">Carregant factures…</p> : null}
      {!loading && invoices.length === 0 ? <p className="text-sm text-muted-foreground">Encara no hi ha factures emeses.</p> : null}
      <ul className="flex flex-col gap-2">
        {invoices.map((invoice) => (
          <li key={invoice.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{invoice.seriesNumber} · {invoice.contactName}</p>
              <p className="text-sm text-muted-foreground">{invoice.invoiceDate} · {euros(invoice.totalAmountCents)} · {invoice.status === "PAID" ? "Cobrada" : "Pendent"}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => markPaid(invoice, invoice.status !== "PAID")}>
              {invoice.status === "PAID" ? "Marca pendent" : "Marca cobrada"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
