"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DocumentForm, type CatalogPick, type Contact, type DocumentPayload } from "@/components/document-form";
import { useOrganizationId } from "@/components/shell";
import { EmptyState, ErrorBanner, LoadingRows, Notice, PageHeader, StatusBadge, formatDate, messageOf } from "@/components/ui-kit";
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

export default function IncomePage() {
  const organizationId = useOrganizationId();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalog, setCatalog] = useState<CatalogPick[]>([]);
  const [invoices, setInvoices] = useState<IssuedInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [people, issued, products] = await Promise.all([
        api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
        api<{ issuedInvoices: IssuedInvoice[] }>(`/organizations/${organizationId}/issued-invoices`),
        api<{ items: CatalogPick[] }>(`/organizations/${organizationId}/catalog`),
      ]);
      setContacts(people.contacts.filter((contact) => contact.role === "CLIENT"));
      setInvoices(issued.issuedInvoices);
      setCatalog(products.items);
    } catch (cause) {
      setError(messageOf(cause, "No s'han pogut carregar les factures"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(payload: DocumentPayload) {
    await api(`/organizations/${organizationId}/issued-invoices`, {
      method: "POST",
      body: JSON.stringify({
        contactId: payload.contactId,
        invoiceDate: payload.date,
        seriesNumber: payload.seriesNumber,
        lines: payload.lines,
      }),
    });
    setNotice(`Factura ${payload.seriesNumber} creada.`);
    await load();
  }

  async function rectify(invoice: IssuedInvoice) {
    setPending(invoice.id);
    setError(null);
    try {
      const created = await api<{ seriesNumber: string }>(`/organizations/${organizationId}/issued-invoices/${invoice.id}/rectify`, {
        method: "POST",
      });
      setNotice(`Rectificativa ${created.seriesNumber} creada.`);
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s’ha pogut crear la rectificativa"));
    } finally {
      setPending(null);
    }
  }

  async function togglePaid(invoice: IssuedInvoice) {
    setPending(invoice.id);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/issued-invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ paid: invoice.status !== "PAID" }),
      });
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut actualitzar l'estat"));
    } finally {
      setPending(null);
    }
  }

  const pendingTotal = invoices
    .filter((invoice) => invoice.status === "UNPAID")
    .reduce((total, invoice) => total + BigInt(invoice.totalAmountCents), 0n);

  return (
    <>
      <PageHeader title="Ingressos" description="Factures emeses als teus clients, amb la base, l’IVA i el total en euros." />
      <ErrorBanner message={error} onRetry={load} />
      <Notice message={notice} />
      <DocumentForm
        title="Nova factura"
        description="Afegeix les línies i revisa la base, l'IVA i el total abans de desar."
        submitLabel="Crea la factura"
        contacts={contacts}
        catalog={catalog}
        onSubmit={create}
      />
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Factures emeses</h2>
          {invoices.length > 0 ? (
            <p className="text-sm text-muted-foreground">Pendent de cobrament: <span className="font-medium text-foreground tabular-nums">{euros(pendingTotal.toString())}</span></p>
          ) : null}
        </div>
        {loading ? (
          <LoadingRows />
        ) : invoices.length === 0 ? (
          <EmptyState title="Encara no hi ha factures emeses" hint="Crea la primera amb el formulari de dalt." />
        ) : (
          <>
            <div className="hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Estat</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.seriesNumber}
                        {invoice.rectifiesSeriesNumber ? (
                          <p className="text-xs font-normal text-muted-foreground">Rectificativa de {invoice.rectifiesSeriesNumber}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>{invoice.contactName}</TableCell>
                      <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{euros(invoice.baseAmountCents)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{euros(invoice.totalAmountCents)}</TableCell>
                      <TableCell><PaidBadge status={invoice.status} /></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <InvoiceActions invoice={invoice} organizationId={organizationId} pending={pending === invoice.id} onPaid={() => togglePaid(invoice)} onRectify={() => rectify(invoice)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{invoice.seriesNumber}</p>
                      {invoice.rectifiesSeriesNumber ? (
                        <p className="text-xs text-muted-foreground">Rectificativa de {invoice.rectifiesSeriesNumber}</p>
                      ) : null}
                      <p className="text-sm text-muted-foreground">{invoice.contactName} · {formatDate(invoice.invoiceDate)}</p>
                    </div>
                    <PaidBadge status={invoice.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold tabular-nums">{euros(invoice.totalAmountCents)}</p>
                    <InvoiceActions invoice={invoice} organizationId={organizationId} pending={pending === invoice.id} onPaid={() => togglePaid(invoice)} onRectify={() => rectify(invoice)} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}

function PaidBadge({ status }: { status: "PAID" | "UNPAID" }) {
  return status === "PAID" ? <StatusBadge tone="success">Cobrada</StatusBadge> : <StatusBadge tone="warning">Pendent</StatusBadge>;
}

function InvoiceActions({
  invoice,
  organizationId,
  pending,
  onPaid,
  onRectify,
}: {
  invoice: IssuedInvoice;
  organizationId: string;
  pending: boolean;
  onPaid: () => void;
  onRectify: () => void;
}) {
  return (
    <>
      <a
        className={buttonVariants({ variant: "outline", size: "sm" })}
        href={apiPath(`/organizations/${organizationId}/issued-invoices/${invoice.id}.pdf`)}
      >
        PDF
      </a>
      {invoice.rectifiesSeriesNumber ? (
        <StatusBadge tone="neutral">Rectificativa</StatusBadge>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onRectify}>
          Rectifica
        </Button>
      )}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={onPaid}>
        {invoice.status === "PAID" ? "Marca pendent" : "Marca cobrada"}
      </Button>
    </>
  );
}
