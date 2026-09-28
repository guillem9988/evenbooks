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

  const { data, error, initialLoading, reload } = useLoad(load, "No s’han pogut carregar les factures");
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
    notifySuccess(`Factura ${payload.seriesNumber} creada.`);
    await reload();
  }

  async function rectify(invoice: IssuedInvoice) {
    setPending(invoice.id);
    try {
      const created = await api<{ seriesNumber: string }>(`/organizations/${organizationId}/issued-invoices/${invoice.id}/rectify`, { method: "POST" });
      notifySuccess(`Rectificativa ${created.seriesNumber} creada.`);
      setRectifying(null);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut crear la rectificativa");
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
      notifySuccess(invoice.status === "PAID" ? `${invoice.seriesNumber} torna a estar pendent.` : `${invoice.seriesNumber} marcada com a cobrada.`);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut actualitzar l’estat");
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
        title="Ingressos"
        description="Factures emeses als teus clients, amb la base, l’IVA i el total."
        actions={
          <Button onClick={() => setCreating(true)} disabled={initialLoading || contacts.length === 0}>
            <PlusIcon /> Nova factura
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
            <KpiCard label="Facturat" value={euros(sumCents(invoices.map((invoice) => invoice.totalAmountCents)))} hint={`${invoices.length} factures en total`} />
            <KpiCard label="Pendent de cobrament" value={euros(sumCents(unpaid.map((invoice) => invoice.totalAmountCents)))} hint={`${unpaid.length} pendents`} />
            <KpiCard label="Cobrat" value={euros(sumCents(invoices.filter((invoice) => invoice.status === "PAID").map((invoice) => invoice.totalAmountCents)))} />
          </div>

          {contacts.length === 0 && invoices.length === 0 ? (
            <EmptyState
              icon={UsersIcon}
              title="Primer necessites un client"
              hint="Les factures s’emeten a un client. Afegeix-lo a Contactes i torna aquí."
              action={<Button render={<Link href="/contactes?nou=1" />}>Afegeix un client</Button>}
            />
          ) : invoices.length === 0 ? (
            <EmptyState
              title="Encara no hi ha factures emeses"
              hint="Crea la primera factura. Podràs descarregar-ne el PDF i marcar-la com a cobrada."
              action={
                <Button onClick={() => setCreating(true)}>
                  <PlusIcon /> Nova factura
                </Button>
              }
            />
          ) : (
            <section className="flex flex-col gap-3" aria-label="Factures emeses">
              <Segmented
                label="Filtra les factures"
                value={filter}
                onChange={setFilter}
                options={[
                  ["ALL", "Totes", invoices.length],
                  ["UNPAID", "Pendents", unpaid.length],
                  ["PAID", "Cobrades", invoices.length - unpaid.length],
                  ["RECTIFICATIVA", "Rectificatives", invoices.filter((invoice) => invoice.rectifiesSeriesNumber !== null).length],
                ]}
              />
              {visible.length === 0 ? (
                <EmptyState title="Cap factura amb aquest filtre" />
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border md:block">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>Número</TableHead>
                          <TableHead>Client</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead className="text-right">Base</TableHead>
                          <TableHead className="text-right">IVA</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead>Estat</TableHead>
                          <TableHead className="text-right">
                            <span className="sr-only">Accions</span>
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
                                    <RectificativaBadge of={invoice.rectifiesSeriesNumber} /> de {invoice.rectifiesSeriesNumber}
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
        title="Nova factura"
        description="Afegeix les línies i revisa la base, l’IVA i el total abans de desar."
        submitLabel="Crea la factura"
        contacts={contacts}
        catalog={data?.catalog ?? []}
        suggestedSeries={nextSeries(invoices.filter((invoice) => invoice.rectifiesSeriesNumber === null).map((invoice) => invoice.seriesNumber))}
        onSubmit={create}
      />

      <FormDialog
        open={rectifying !== null}
        onOpenChange={(open) => !open && setRectifying(null)}
        title={`Rectifica la factura ${rectifying?.seriesNumber ?? ""}`}
        description="Es crearà una factura rectificativa amb els mateixos imports en negatiu. La factura original no es modifica."
        submitLabel="Crea la rectificativa"
        busy={rectifying !== null && pending === rectifying.id}
        destructive
        onSubmit={() => (rectifying ? rectify(rectifying) : undefined)}
      >
        {rectifying ? (
          <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Client</dt>
              <dd className="font-medium">{rectifying.contactName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Total a rectificar</dt>
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
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onPaid}>
        {invoice.status === "PAID" ? (
          <>
            <UndoIcon /> Pendent
          </>
        ) : (
          <>
            <CheckIcon /> Cobrada
          </>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Més accions per a ${invoice.seriesNumber}`} />}>
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<a href={apiPath(`/organizations/${organizationId}/issued-invoices/${invoice.id}.pdf`)} />}>
            <FileDownIcon /> Descarrega el PDF
          </DropdownMenuItem>
          {canRectify ? (
            <DropdownMenuItem onClick={onRectify}>
              <FilePenLineIcon /> Crea una rectificativa
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
