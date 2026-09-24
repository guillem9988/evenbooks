"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizationId } from "@/components/shell";
import { api } from "@/lib/api";
import { euros, parseEuroInput } from "@/lib/money";

interface Contact { id: string; legalName: string; role: string }
interface Quote {
  id: string;
  seriesNumber: string;
  quoteDate: string;
  status: string;
  contactName: string;
  totalAmountCents: string;
}

export default function QuotesPage() {
  const organizationId = useOrganizationId();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [contactId, setContactId] = useState("");
  const [seriesNumber, setSeriesNumber] = useState("");
  const [quoteDate, setQuoteDate] = useState("2026-09-01");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [taxRate, setTaxRate] = useState("21");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [people, listed] = await Promise.all([
        api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
        api<{ quotes: Quote[] }>(`/organizations/${organizationId}/quotes`),
      ]);
      setContacts(people.contacts.filter((contact) => contact.role === "CLIENT"));
      setQuotes(listed.quotes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'han pogut carregar els pressupostos");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  async function createQuote(event: React.FormEvent) {
    event.preventDefault();
    const unitAmountCents = parseEuroInput(price);
    if (unitAmountCents === null) {
      setError("El preu ha de ser un import en euros, per exemple 100,00");
      return;
    }
    setError(null);
    try {
      await api(`/organizations/${organizationId}/quotes`, {
        method: "POST",
        body: JSON.stringify({
          contactId,
          quoteDate,
          seriesNumber,
          lines: [{ description, quantity: 1, unitAmountCents, taxRate: Number(taxRate) }],
        }),
      });
      setSeriesNumber("");
      setDescription("");
      setPrice("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut crear el pressupost");
    }
  }

  async function convert(quote: Quote) {
    const series = window.prompt("Número de la factura", quote.seriesNumber.replace(/^P/, "F"));
    if (series === null || series.trim() === "") return;
    setError(null);
    try {
      await api(`/organizations/${organizationId}/quotes/${quote.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ seriesNumber: series.trim() }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut convertir el pressupost");
    }
  }

  if (!organizationId) return <p className="text-sm text-muted-foreground">Crea l'organització per fer pressupostos.</p>;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Pressupostos</h1>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={createQuote}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contact">Client</Label>
          <select id="contact" className="h-8 rounded-lg border bg-background px-2 text-sm" value={contactId} onChange={(event) => setContactId(event.target.value)} required>
            <option value="">Tria un client</option>
            {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.legalName}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="series">Número</Label>
          <Input id="series" value={seriesNumber} onChange={(event) => setSeriesNumber(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="date">Data</Label>
          <Input id="date" type="date" value={quoteDate} onChange={(event) => setQuoteDate(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Concepte</Label>
          <Input id="description" value={description} onChange={(event) => setDescription(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="price">Preu</Label>
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
        <Button type="submit">Crea el pressupost</Button>
      </form>
      {loading ? <p className="text-sm text-muted-foreground">Carregant pressupostos…</p> : null}
      {!loading && quotes.length === 0 ? <p className="text-sm text-muted-foreground">Encara no hi ha pressupostos.</p> : null}
      <ul className="flex flex-col gap-2">
        {quotes.map((quote) => (
          <li key={quote.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{quote.seriesNumber} · {quote.contactName}</p>
              <p className="text-sm text-muted-foreground">{quote.quoteDate} · {euros(quote.totalAmountCents)} · {quote.status === "CONVERTED" ? "Convertit" : "Obert"}</p>
            </div>
            {quote.status === "OPEN" ? <Button type="button" onClick={() => convert(quote)}>Converteix en factura</Button> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
