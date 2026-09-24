"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentForm, type Contact, type DocumentPayload } from "@/components/document-form";
import { useOrganizationId } from "@/components/shell";
import { EmptyState, ErrorBanner, LoadingRows, Notice, PageHeader, StatusBadge, formatDate, messageOf } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";

interface Quote {
  id: string;
  seriesNumber: string;
  quoteDate: string;
  status: "OPEN" | "CONVERTED";
  contactName: string;
  totalAmountCents: string;
}

export default function QuotesPage() {
  const organizationId = useOrganizationId();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
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
      setError(messageOf(cause, "No s'han pogut carregar els pressupostos"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(payload: DocumentPayload) {
    await api(`/organizations/${organizationId}/quotes`, {
      method: "POST",
      body: JSON.stringify({
        contactId: payload.contactId,
        quoteDate: payload.date,
        seriesNumber: payload.seriesNumber,
        lines: payload.lines,
      }),
    });
    setNotice(`Pressupost ${payload.seriesNumber} creat.`);
    await load();
  }

  async function convert(quote: Quote, seriesNumber: string) {
    setError(null);
    try {
      await api(`/organizations/${organizationId}/quotes/${quote.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ seriesNumber }),
      });
      setNotice(`Pressupost ${quote.seriesNumber} convertit en la factura ${seriesNumber}.`);
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut convertir el pressupost"));
    }
  }

  return (
    <>
      <PageHeader title="Pressupostos" description="Envia una proposta i converteix-la en factura quan el client l'accepti." />
      <ErrorBanner message={error} onRetry={load} />
      <Notice message={notice} />
      <DocumentForm
        title="Nou pressupost"
        description="Mateixes línies que una factura. Quan el converteixis, es crea una factura emesa amb aquests imports."
        submitLabel="Crea el pressupost"
        contacts={contacts}
        onSubmit={create}
      />
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Pressupostos</h2>
        {loading ? (
          <LoadingRows />
        ) : quotes.length === 0 ? (
          <EmptyState title="Encara no hi ha pressupostos" hint="Crea'n un i converteix-lo en factura amb un clic." />
        ) : (
          <>
            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estat</TableHead>
                    <TableHead className="w-72" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotes.map((quote) => (
                    <TableRow key={quote.id}>
                      <TableCell className="font-medium">{quote.seriesNumber}</TableCell>
                      <TableCell>{quote.contactName}</TableCell>
                      <TableCell>{formatDate(quote.quoteDate)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{euros(quote.totalAmountCents)}</TableCell>
                      <TableCell><QuoteBadge status={quote.status} /></TableCell>
                      <TableCell>{quote.status === "OPEN" ? <ConvertControl quote={quote} onConvert={convert} /> : null}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {quotes.map((quote) => (
                <li key={quote.id} className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{quote.seriesNumber}</p>
                      <p className="text-sm text-muted-foreground">{quote.contactName} · {formatDate(quote.quoteDate)}</p>
                    </div>
                    <QuoteBadge status={quote.status} />
                  </div>
                  <p className="text-lg font-semibold tabular-nums">{euros(quote.totalAmountCents)}</p>
                  {quote.status === "OPEN" ? <ConvertControl quote={quote} onConvert={convert} /> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function ConvertControl({ quote, onConvert }: { quote: Quote; onConvert: (quote: Quote, series: string) => Promise<void> }) {
  const [series, setSeries] = useState(`F-${quote.seriesNumber}`);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        await onConvert(quote, series.trim());
        setBusy(false);
      }}
    >
      <Input aria-label="Número de la factura" value={series} onChange={(event) => setSeries(event.target.value)} required />
      <Button type="submit" size="sm" className="h-8 shrink-0" disabled={busy}>
        {busy ? "Convertint…" : "Converteix"}
      </Button>
    </form>
  );
}

function QuoteBadge({ status }: { status: "OPEN" | "CONVERTED" }) {
  return status === "CONVERTED" ? <StatusBadge tone="success">Convertit</StatusBadge> : <StatusBadge tone="neutral">Obert</StatusBadge>;
}
