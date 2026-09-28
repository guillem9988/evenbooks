"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckIcon, FileDownIcon, FilePenLineIcon, MoreHorizontalIcon, PlusIcon, UndoIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentDialog, nextSeries, type CatalogPick, type Contact, type DocumentPayload } from "@/components/document-form";
import { useOrganizationId } from "@/components/shell";
import { PaidBadge, RectificativaBadge } from "@/components/status-badges";
import {
  CardsSkeleton,
  EmptyState,
  ErrorBanner,
  FormDialog,
  KpiCard,
  PageHeader,
  Segmented,
  TableSkeleton,
  formatDate,
  notifyError,
  notifySuccess,
  sumCents,
  useLoad,
} from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api, apiPath } from "@/lib/api";
import { euros } from "@/lib/money";

interface IssuedInvoice {
  id: string;
  seriesNumber: string;
  invoiceDate: string;
  status: "PAID" | "UNPAID";
  contactName: string;
  rectifiesSeriesNumber: string | null;
  baseAmountCents: string;
  taxAmountCents: string;
  totalAmountCents: string;
}

interface IncomeData {
  contacts: Contact[];
  invoices: IssuedInvoice[];
  catalog: CatalogPick[];
}

type Filter = "ALL" | "UNPAID" | "PAID" | "RECTIFICATIVA";

export default function IncomePage() {
  const t = useT();
  const organizationId = useOrganizationId();
  const [creating, setCreating] = useState(false);
  const [rectifying, setRectifying] = useState<IssuedInvoice | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  const load = useCallback(async (): Promise<IncomeData> => {
    const [people, issued, products] = await Promise.all([
      api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
      api<{ issuedInvoices: IssuedInvoice[] }>(`/organizations/${organizationId}/issued-invoices`),
      api<{ items: CatalogPick[] }>(`/organizations/${organizationId}/catalog`),
    ]);
    return { contacts: people.contacts.filter((contact) => contact.role === "CLIENT"), invoices: issued.issuedInvoices, catalog: products.items };
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, t("income.loadFailed"));
  const invoices = useMemo(() => data?.invoices ?? [], [data]);
  const contacts = data?.contacts ?? [];

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nova") === "1") {
      setCreating(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const visible = invoices.filter((invoice) => {
    if (filter === "UNPAID") return invoice.status === "UNPAID";
    if (filter === "PAID") return invoice.status === "PAID";
    if (filter === "RECTIFICATIVA") return invoice.rectifiesSeriesNumber !== null;
    return true;
  });
  const unpaid = invoices.filter((invoice) => invoice.status === "UNPAID");
  const rectifiedSeries = new Set(invoices.map((invoice) => invoice.rectifiesSeriesNumber).filter(Boolean));

  async function create(payload: DocumentPayload) {
    await api(`/organizations/${organizationId}/issued-invoices`, {
      method: "POST",
      body: JSON.stringify({ contactId: payload.contactId, invoiceDate: payload.date, seriesNumber: payload.seriesNumber, lines: payload.lines }),
    });
    notifySuccess(t("income.created", { series: payload.seriesNumber }));
    await reload();
  }

  async function rectify(invoice: IssuedInvoice) {
    setPending(invoice.id);
    try {
      const created = await api<{ seriesNumber: string }>(`/organizations/${organizationId}/issued-invoices/${invoice.id}/rectify`, { method: "POST" });
      notifySuccess(t("income.rectificativaCreated", { series: created.seriesNumber }));
      setRectifying(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("income.rectifyFailed"));
    } finally {
      setPending(null);
    }
  }

  async function togglePaid(invoice: IssuedInvoice) {
    setPending(invoice.id);
    try {
      await api(`/organizations/${organizationId}/issued-invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ paid: invoice.status !== "PAID" }),
      });
      notifySuccess(
        invoice.status === "PAID"
          ? t("income.markedUnpaid", { series: invoice.seriesNumber })
          : t("income.markedPaid", { series: invoice.seriesNumber }),
      );
      await reload();
    } catch (cause) {
      notifyError(cause, t("income.statusFailed"));
    } finally {
      setPending(null);
    }
  }

  const actions = (invoice: IssuedInvoice) => (
    <InvoiceActions
      invoice={invoice}
      organizationId={organizationId}
      pending={pending === invoice.id}
      canRectify={invoice.rectifiesSeriesNumber === null && !rectifiedSeries.has(invoice.seriesNumber)}
      onPaid={() => togglePaid(invoice)}
      onRectify={() => setRectifying(invoice)}
    />
  );

  return (
    <>
      <PageHeader
        title={t("income.title")}
        description={t("income.description")}
        actions={
          <Button onClick={() => setCreating(true)} disabled={initialLoading || contacts.length === 0}>
            <PlusIcon /> {t("income.newInvoice")}
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <>
          <CardsSkeleton count={3} className="lg:grid-cols-3" />
          <TableSkeleton columns={6} />
        </>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              label={t("income.billed")}
              value={euros(sumCents(invoices.map((invoice) => invoice.totalAmountCents)))}
              hint={t("income.billedHint", { count: invoices.length })}
            />
            <KpiCard
              label={t("income.unpaid")}
              value={euros(sumCents(unpaid.map((invoice) => invoice.totalAmountCents)))}
              hint={t("income.unpaidHint", { count: unpaid.length })}
            />
            <KpiCard
              label={t("income.paid")}
              value={euros(sumCents(invoices.filter((invoice) => invoice.status === "PAID").map((invoice) => invoice.totalAmountCents)))}
            />
          </div>

          {contacts.length === 0 && invoices.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title={t("income.needClient")}
              hint={t("income.needClientHint")}
              action={<Button render={<Link href="/contactes?nou=1" />}>{t("income.addClient")}</Button>}
            />
          ) : invoices.length === 0 ? (
            <EmptyState
              title={t("income.empty")}
              hint={t("income.emptyHint")}
              action={
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon /> {t("income.newInvoice")}
                </Button>
              }
            />
          ) : (
            <section className="flex flex-col gap-3" aria-label={t("income.listLabel")}>
              <Segmented
                label={t("income.filter")}
                value={filter}
                onChange={setFilter}
                options={[
                  ["ALL", t("income.all"), invoices.length],
                  ["UNPAID", t("income.pending"), unpaid.length],
                  ["PAID", t("income.collected"), invoices.length - unpaid.length],
                  ["RECTIFICATIVA", t("income.rectificatives"), invoices.filter((invoice) => invoice.rectifiesSeriesNumber !== null).length],
                ]}
              />
              {visible.length === 0 ? (
                <EmptyState title={t("income.emptyFilter")} />
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border md:block">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>{t("common.number")}</TableHead>
                          <TableHead>{t("common.client")}</TableHead>
                          <TableHead>{t("common.date")}</TableHead>
                          <TableHead className="text-right">{t("common.base")}</TableHead>
                          <TableHead className="text-right">{t("common.vat")}</TableHead>
                          <TableHead className="text-right">{t("common.total")}</TableHead>
                          <TableHead>{t("common.status")}</TableHead>
                          <TableHead className="text-right">
                            <span className="sr-only">{t("common.actions")}</span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((invoice) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-medium">
                              <div className="flex flex-col gap-1">
                                {invoice.seriesNumber}
                                {invoice.rectifiesSeriesNumber ? (
                                  <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                                    <RectificativaBadge of={invoice.rectifiesSeriesNumber} />{" "}
                                    {t("income.ofSeries", { series: invoice.rectifiesSeriesNumber })}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-48 truncate">{invoice.contactName}</TableCell>
                            <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(invoice.baseAmountCents)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(invoice.taxAmountCents)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{euros(invoice.totalAmountCents)}</TableCell>
                            <TableCell>
                              <PaidBadge status={invoice.status} />
                            </TableCell>
                            <TableCell className="text-right">{actions(invoice)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="flex flex-col gap-2 md:hidden">
                    {visible.map((invoice) => (
                      <li key={invoice.id} className="flex flex-col gap-3 rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium">{invoice.seriesNumber}</p>
                            <p className="truncate text-sm text-muted-foreground">
                              {invoice.contactName} · {formatDate(invoice.invoiceDate)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <PaidBadge status={invoice.status} />
                            {invoice.rectifiesSeriesNumber ? <RectificativaBadge of={invoice.rectifiesSeriesNumber} /> : null}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-lg font-semibold tabular-nums">{euros(invoice.totalAmountCents)}</p>
                          {actions(invoice)}
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      ) : null}

      <DocumentDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("income.dialogTitle")}
        description={t("income.dialogDescription")}
        submitLabel={t("income.dialogSubmit")}
        contacts={contacts}
        catalog={data?.catalog ?? []}
        suggestedSeries={nextSeries(invoices.filter((invoice) => invoice.rectifiesSeriesNumber === null).map((invoice) => invoice.seriesNumber))}
        onSubmit={create}
      />

      <FormDialog
        open={rectifying !== null}
        onOpenChange={(open) => !open && setRectifying(null)}
        title={t("income.rectifyTitle", { series: rectifying?.seriesNumber ?? "" })}
        description={t("income.rectifyDescription")}
        submitLabel={t("income.rectifySubmit")}
        busy={rectifying !== null && pending === rectifying.id}
        destructive
        onSubmit={() => (rectifying ? rectify(rectifying) : undefined)}
      >
        {rectifying ? (
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("common.client")}</dt>
              <dd className="font-medium">{rectifying.contactName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("income.totalToRectify")}</dt>
              <dd className="font-medium tabular-nums">{euros(rectifying.totalAmountCents)}</dd>
            </div>
          </dl>
        ) : null}
      </FormDialog>
    </>
  );
}

function InvoiceActions({
  invoice,
  organizationId,
  pending,
  canRectify,
  onPaid,
  onRectify,
}: {
  invoice: IssuedInvoice;
  organizationId: string;
  pending: boolean;
  canRectify: boolean;
  onPaid: () => void;
  onRectify: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onPaid}>
        {invoice.status === "PAID" ? (
          <>
            <UndoIcon /> {t("income.pendingBtn")}
          </>
        ) : (
          <>
            <CheckIcon /> {t("income.paidBtn")}
          </>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("income.moreActions", { series: invoice.seriesNumber })} />}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a href={apiPath(`/organizations/${organizationId}/issued-invoices/${invoice.id}.pdf`)} />}>
            <FileDownIcon /> {t("income.downloadPdf")}
          </DropdownMenuItem>
          {canRectify ? (
            <DropdownMenuItem onClick={onRectify}>
              <FilePenLineIcon /> {t("income.createRectificativa")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
