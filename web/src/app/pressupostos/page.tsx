"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeftIcon, FileDownIcon, MoreHorizontalIcon, PlusIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useT } from "@/i18n";
import { api, apiPath } from "@/lib/api";
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
  const t = useT();
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

  const { data, error, initialLoading, reload } = useLoad(load, t("quotes.loadFailed"));
  const quotes = data?.quotes ?? [];
  const contacts = data?.contacts ?? [];
  const open = quotes.filter((quote) => quote.status === "OPEN");
  const visible = filter === "ALL" ? quotes : quotes.filter((quote) => quote.status === filter);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nou") === "1") {
      setCreating(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function create(payload: DocumentPayload) {
    await api(`/organizations/${organizationId}/quotes`, {
      method: "POST",
      body: JSON.stringify({ contactId: payload.contactId, quoteDate: payload.date, seriesNumber: payload.seriesNumber, lines: payload.lines }),
    });
    notifySuccess(t("quotes.created", { series: payload.seriesNumber }));
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
      setSeriesError(t("quotes.seriesRequired"));
      return;
    }
    setBusy(true);
    try {
      await api(`/organizations/${organizationId}/quotes/${converting.id}/convert`, {
        method: "POST",
        body: JSON.stringify({ seriesNumber: series.trim() }),
      });
      notifySuccess(t("quotes.converted", { quote: converting.seriesNumber, invoice: series.trim() }));
      setConverting(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("quotes.convertFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuote(quote: Quote) {
    if (!confirm(t("quotes.deleteConfirm"))) return;
    try {
      await api(`/organizations/${organizationId}/quotes/${quote.id}`, { method: "DELETE" });
      notifySuccess(t("quotes.deleteSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("quotes.deleteFailed"));
    }
  }

  const quoteActions = (quote: Quote) => (
    <div className="flex items-center justify-end gap-1.5">
      {quote.status === "OPEN" ? (
        <Button type="button" variant="outline" size="sm" onClick={() => startConvert(quote)}>
          <ArrowRightLeftIcon className="size-3.5" /> {t("quotes.convert")}
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Més accions per a ${quote.seriesNumber}`} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a href={apiPath(`/organizations/${organizationId}/quotes/${quote.id}.pdf`)} />}>
            <FileDownIcon /> {t("quotes.downloadPdf")}
          </DropdownMenuItem>
          {quote.status === "OPEN" ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void deleteQuote(quote)}
            >
              <Trash2Icon /> {t("quotes.deleteQuote")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("quotes.title")}
        description={t("quotes.description")}
        actions={
          <Button onClick={() => setCreating(true)} disabled={initialLoading || contacts.length === 0}>
            <PlusIcon /> {t("quotes.newQuote")}
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
            title={t("quotes.needClient")}
            hint={t("quotes.needClientHint")}
            action={<Button render={<Link href="/contactes?nou=1" />}>{t("quotes.addClient")}</Button>}
          />
        ) : quotes.length === 0 ? (
          <EmptyState
            title={t("quotes.empty")}
            hint={t("quotes.emptyHint")}
            action={
              <Button onClick={() => setCreating(true)}>
                <PlusIcon /> {t("quotes.newQuote")}
              </Button>
            }
          />
        ) : (
          <section className="flex flex-col gap-3" aria-label={t("quotes.listLabel")}>
            <Segmented
              label={t("quotes.filter")}
              value={filter}
              onChange={setFilter}
              options={[
                ["ALL", t("quotes.all"), quotes.length],
                ["OPEN", t("quotes.open"), open.length],
                ["CONVERTED", t("quotes.invoiced"), quotes.length - open.length],
              ]}
            />
            {visible.length === 0 ? (
              <EmptyState title={t("quotes.emptyFilter")} />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>{t("common.number")}</TableHead>
                        <TableHead>{t("common.client")}</TableHead>
                        <TableHead>{t("common.date")}</TableHead>
                        <TableHead className="text-right">{t("common.total")}</TableHead>
                        <TableHead>{t("common.status")}</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">{t("common.actions")}</span>
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
                          <TableCell className="text-right">{quoteActions(quote)}</TableCell>
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
                        {quoteActions(quote)}
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
        title={t("quotes.dialogTitle")}
        description={t("quotes.dialogDescription")}
        submitLabel={t("quotes.dialogSubmit")}
        contacts={contacts}
        catalog={data?.catalog ?? []}
        suggestedSeries={nextSeries(quotes.map((quote) => quote.seriesNumber)).replace(/^(\d{4}-)/, "P-$1")}
        onSubmit={create}
      />

      <FormDialog
        open={converting !== null}
        onOpenChange={(next) => !next && setConverting(null)}
        title={t("quotes.convertTitle", { series: converting?.seriesNumber ?? "" })}
        description={
          converting
            ? t("quotes.convertDescription", { client: converting.contactName, amount: euros(converting.totalAmountCents) })
            : undefined
        }
        submitLabel={t("quotes.convertSubmit")}
        busy={busy}
        onSubmit={convert}
      >
        <Field id="convert-series" label={t("quotes.invoiceNumber")} error={seriesError} hint={t("quotes.invoiceNumberHint")}>
          <Input id="convert-series" value={series} onChange={(event) => setSeries(event.target.value)} autoFocus />
        </Field>
      </FormDialog>
    </>
  );
}
