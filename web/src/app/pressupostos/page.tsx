"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowRightLeftIcon, PlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentDialog, nextSeries, type CatalogPick, type Contact, type DocumentPayload } from "@/components/document-form";
import { useOrganizationId } from "@/components/shell";
import { QuoteBadge } from "@/components/status-badges";
import {
  EmptyState,
  ErrorBanner,
  Field,
  FormDialog,
  PageHeader,
  Segmented,
  TableSkeleton,
  formatDate,
  notifyError,
  notifySuccess,
  useLoad,
} from "@/components/ui-kit";
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

interface QuotesData {
  contacts: Contact[];
  quotes: Quote[];
  catalog: CatalogPick[];
  invoiceSeries: string[];
}

type Filter = "ALL" | "OPEN" | "CONVERTED";

export default function QuotesPage() {
  const organizationId = useOrganizationId();
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<Quote | null>(null);
  const [series, setSeries] = useState("");
  const [seriesError, setSeriesError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");

  const load = useCallback(async (): Promise<QuotesData> => {
    const [people, listed, products, issued] = await Promise.all([
      api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
      api<{ quotes: Quote[] }>(`/organizations/${organizationId}/quotes`),
      api<{ items: CatalogPick[] }>(`/organizations/${organizationId}/catalog`),
      api<{ issuedInvoices: Array<{ seriesNumber: string; rectifiesSeriesNumber: string | null }> }>(`/organizations/${organizationId}/issued-invoices`),
    ]);
    return {
      contacts: people.contacts.filter((contact) => contact.role === "CLIENT"),
      quotes: listed.quotes,
      catalog: products.items,
      invoiceSeries: issued.issuedInvoices.filter((invoice) => invoice.rectifiesSeriesNumber === null).map((invoice) => invoice.seriesNumber),
    };
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, "No s’han pogut carregar els pressupostos");
  const quotes = data?.quotes ?? [];
  const contacts = data?.contacts ?? [];
  const open = quotes.filter((quote) => quote.status === "OPEN");
  const visible = filter === "ALL" ? quotes : quotes.filter((quote) => quote.status === filter);

  async function create(payload: DocumentPayload) {
    await api(`/organizations/${organizationId}/quotes`, {
      method: "POST",
      body: JSON.stringify({ contactId: payload.contactId, quoteDate: payload.date, seriesNumber: payload.seriesNumber, lines: payload.lines }),
    });
    notifySuccess(`Pressupost ${payload.seriesNumber} creat.`);
    await reload();
  }

  function startConvert(quote: Quote) {
    setConverting(quote);
    setSeries(nextSeries(data?.invoiceSeries ?? []));
    setSeriesError(null);
  }

  async function convert() {
    if (converting === null) return;
    if (series.trim() === "") {
      setSeriesError("Escriu el número de la factura.");
      return;
    }
    setBusy(true);
    try {
      await api(`/organizations/${organizationId}/quotes/${converting.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ seriesNumber: series.trim() }),
      });
      notifySuccess(`Pressupost ${converting.seriesNumber} convertit en la factura ${series.trim()}.`);
      setConverting(null);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut convertir el pressupost");
    } finally {
      setBusy(false);
    }
  }

  const convertButton = (quote: Quote) =>
    quote.status === "OPEN" ? (
      <Button type="button" variant="outline" size="sm" onClick={() => startConvert(quote)}>
        <ArrowRightLeftIcon /> Converteix en factura
      </Button>
    ) : null;

  return (
    <>
      <PageHeader
        title="Pressupostos"
        description="Envia una proposta i converteix-la en factura quan el client l’accepti."
        actions={
          <Button onClick={() => setCreating(true)} disabled={initialLoading || contacts.length === 0}>
            <PlusIcon /> Nou pressupost
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <TableSkeleton columns={5} />
      ) : data ? (
        contacts.length === 0 && quotes.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title="Primer necessites un client"
            hint="Els pressupostos s’adrecen a un client. Afegeix-lo a Contactes."
            action={<Button render={<Link href="/contactes?nou=1" />}>Afegeix un client</Button>}
          />
        ) : quotes.length === 0 ? (
          <EmptyState
            title="Encara no hi ha pressupostos"
            hint="Crea’n un i converteix-lo en factura amb un clic quan l’acceptin."
            action={
              <Button onClick={() => setCreating(true)}>
                <PlusIcon /> Nou pressupost
              </Button>
            }
          />
        ) : (
          <section className="flex flex-col gap-3" aria-label="Pressupostos">
            <Segmented
              label="Filtra els pressupostos"
              value={filter}
              onChange={setFilter}
              options={[
                ["ALL", "Tots", quotes.length],
                ["OPEN", "Oberts", open.length],
                ["CONVERTED", "Facturats", quotes.length - open.length],
              ]}
            />
            {visible.length === 0 ? (
              <EmptyState title="Cap pressupost amb aquest filtre" />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Estat</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Accions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((quote) => (
                        <TableRow key={quote.id}>
                          <TableCell className="font-medium">{quote.seriesNumber}</TableCell>
                          <TableCell className="max-w-56 truncate">{quote.contactName}</TableCell>
                          <TableCell>{formatDate(quote.quoteDate)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{euros(quote.totalAmountCents)}</TableCell>
                          <TableCell>
                            <QuoteBadge status={quote.status} />
                          </TableCell>
                          <TableCell className="text-right">{convertButton(quote)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="flex flex-col gap-2 md:hidden">
                  {visible.map((quote) => (
                    <li key={quote.id} className="flex flex-col gap-3 rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{quote.seriesNumber}</p>
                          <p className="truncate text-sm text-muted-foreground">
                            {quote.contactName} · {formatDate(quote.quoteDate)}
                          </p>
                        </div>
                        <QuoteBadge status={quote.status} />
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-lg font-semibold tabular-nums">{euros(quote.totalAmountCents)}</p>
                        {convertButton(quote)}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      ) : null}

      <DocumentDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nou pressupost"
        description="Les mateixes línies que una factura. Quan el converteixis, es crearà una factura emesa amb aquests imports."
        submitLabel="Crea el pressupost"
        contacts={contacts}
        catalog={data?.catalog ?? []}
        suggestedSeries={nextSeries(quotes.map((quote) => quote.seriesNumber)).replace(/^(\d{4}-)/, "P-$1")}
        onSubmit={create}
      />

      <FormDialog
        open={converting !== null}
        onOpenChange={(next) => !next && setConverting(null)}
        title={`Converteix ${converting?.seriesNumber ?? ""} en factura`}
        description={converting ? `Es crearà una factura per a ${converting.contactName} de ${euros(converting.totalAmountCents)}.` : undefined}
        submitLabel="Crea la factura"
        busy={busy}
        onSubmit={convert}
      >
        <Field id="convert-series" label="Número de la factura" error={seriesError} hint="Ha de ser únic dins de les teves factures.">
          <Input id="convert-series" value={series} onChange={(event) => setSeries(event.target.value)} autoFocus />
        </Field>
      </FormDialog>
    </>
  );
}
