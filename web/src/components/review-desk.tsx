"use client";

import { useCallback, useEffect, useState } from "react";
import { DownloadIcon, RefreshCwIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOrganizationId } from "@/components/shell";
import {
  EmptyState,
  ErrorBanner,
  Field,
  LoadingRows,
  Notice,
  PageHeader,
  StatusBadge,
  formatDate,
  messageOf,
  quarterRange,
  currentQuarter,
} from "@/components/ui-kit";
import { api, apiPath } from "@/lib/api";
import { euros } from "@/lib/money";

interface BankLine {
  id: string;
  transactionDate: string;
  amountCents: string;
  rawDescription: string;
}

interface InvoiceLine {
  id: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmountCents: string | null;
}

interface Breakdown {
  amount: { score: string };
  date: { score: string };
  text: { score: string };
  vendor: { score: string };
}

interface Suggestion {
  confidenceScore: string;
  breakdown: Breakdown;
  transaction: BankLine;
  invoice: InvoiceLine;
}

interface AutoMatch extends Suggestion {
  id: string;
}

interface ReviewPayload {
  suggestions: Suggestion[];
  autoMatched: AutoMatch[];
}

export function ReviewDesk() {
  const organizationId = useOrganizationId();
  const initialRange = quarterRange(currentQuarter());
  const [statement, setStatement] = useState<File | null>(null);
  const [invoices, setInvoices] = useState<File[]>([]);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await api<ReviewPayload>(`/organizations/${organizationId}/reconciliation/review`);
      setReview({ suggestions: body.suggestions ?? [], autoMatched: body.autoMatched ?? [] });
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut carregar la revisió"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  async function run(key: string, action: () => Promise<string>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (cause) {
      setError(messageOf(cause, "L'acció ha fallat"));
    } finally {
      setBusy(null);
    }
  }

  const uploadStatement = () =>
    run("statement", async () => {
      if (statement === null) return "";
      const data = new FormData();
      data.set("file", statement);
      const body = await api<{ totalTransactions: number }>(`/organizations/${organizationId}/statements`, {
        method: "POST",
        body: data,
      });
      setStatement(null);
      return `Extracte importat: ${body.totalTransactions} moviments.`;
    });

  const uploadInvoices = () =>
    run("invoices", async () => {
      const data = new FormData();
      for (const file of invoices) data.append("files", file);
      const body = await api<{ invoiceIds: string[] }>(`/organizations/${organizationId}/invoices`, {
        method: "POST",
        body: data,
      });
      setInvoices([]);
      return `${body.invoiceIds.length} factures a la cua d'anàlisi. Apareixeran a Despeses.`;
    });

  const reconcile = () =>
    run("reconcile", async () => {
      const body = await api<{ confirmed: unknown[]; suggestions: unknown[] }>(`/organizations/${organizationId}/reconcile`, {
        method: "POST",
      });
      await loadReview();
      return `Conciliació feta: ${body.confirmed.length} automàtiques i ${body.suggestions.length} suggeriments.`;
    });

  const confirm = (row: Suggestion) =>
    run(row.transaction.id, async () => {
      await api(`/organizations/${organizationId}/reconciliation/matches`, {
        method: "POST",
        body: JSON.stringify({ transactionId: row.transaction.id, invoiceId: row.invoice.id }),
      });
      await loadReview();
      return "Suggeriment confirmat.";
    });

  const reject = (matchId: string) =>
    run(matchId, async () => {
      await api(`/organizations/${organizationId}/reconciliation/matches/${matchId}/reject`, { method: "POST" });
      await loadReview();
      return "Conciliació desfeta. El moviment torna a estar pendent.";
    });

  const zipUrl = apiPath(`/organizations/${organizationId}/reports/accountant-export?from=${from}&to=${to}`);

  return (
    <>
      <PageHeader
        title="Banc"
        description="Importa l'extracte i les factures, concilia i revisa el que el sistema no ha pogut confirmar sol."
        actions={
          <>
            <Button variant="outline" disabled={busy !== null || loading} onClick={() => void loadReview()}>
              <RefreshCwIcon /> Actualitza
            </Button>
            <Button disabled={busy !== null} onClick={reconcile}>
              {busy === "reconcile" ? "Conciliant…" : "Concilia ara"}
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} />
      <Notice message={notice} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Extracte bancari</CardTitle>
            <CardDescription>CSV, OFX, QFX o Excel (.xlsx).</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              aria-label="Fitxer de l'extracte"
              type="file"
              accept=".csv,.ofx,.qfx,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/x-ofx"
              onChange={(event) => setStatement(event.target.files?.[0] ?? null)}
            />
            <Button variant="outline" disabled={statement === null || busy !== null} onClick={uploadStatement}>
              <UploadIcon /> {busy === "statement" ? "Pujant…" : "Importa l’extracte"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Factures rebudes</CardTitle>
            <CardDescription>PDF, PNG o JPG. Se n’extreuen els imports automàticament.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              aria-label="Fitxers de factures"
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg"
              onChange={(event) => setInvoices(Array.from(event.target.files ?? []))}
            />
            <Button variant="outline" disabled={invoices.length === 0 || busy !== null} onClick={uploadInvoices}>
              <UploadIcon /> {busy === "invoices" ? "Pujant…" : invoices.length > 1 ? `Puja ${invoices.length} factures` : "Puja la factura"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">
          Suggeriments per revisar {review ? <span className="text-muted-foreground">({review.suggestions.length})</span> : null}
        </h2>
        {loading ? (
          <LoadingRows />
        ) : review === null || review.suggestions.length === 0 ? (
          <EmptyState title="No hi ha suggeriments pendents" hint="Els emparellaments amb confiança entre 0,65 i 0,88 apareixeran aquí." />
        ) : (
          <ul className="flex flex-col gap-2">
            {review.suggestions.map((row) => (
              <PairRow
                key={`${row.transaction.id}-${row.invoice.id}`}
                row={row}
                action={
                  <Button disabled={busy !== null} onClick={() => confirm(row)}>
                    {busy === row.transaction.id ? "Confirmant…" : "Confirma"}
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">
          Conciliades automàticament {review ? <span className="text-muted-foreground">({review.autoMatched.length})</span> : null}
        </h2>
        {loading ? (
          <LoadingRows rows={2} />
        ) : review === null || review.autoMatched.length === 0 ? (
          <EmptyState title="Encara no hi ha conciliacions automàtiques" />
        ) : (
          <ul className="flex flex-col gap-2">
            {review.autoMatched.map((row) => (
              <PairRow
                key={row.id}
                row={row}
                action={
                  <Button variant="destructive" disabled={busy !== null} onClick={() => reject(row.id)}>
                    {busy === row.id ? "Desfent…" : "Rebutja"}
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Paquet per a la gestoria</CardTitle>
          <CardDescription>ZIP amb el resum de moviments, les factures reanomenades i les despeses sense justificant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field id="zip-from" label="Des de">
            <Input id="zip-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field id="zip-to" label="Fins a">
            <Input id="zip-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Button variant="outline" disabled={!from || !to || from > to} render={<a href={zipUrl} />}>
            <DownloadIcon /> Descarrega el ZIP
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function PairRow({ row, action }: { row: Suggestion; action: React.ReactNode }) {
  const score = Number(row.confidenceScore);
  const tone = score >= 0.88 ? "success" : score >= 0.75 ? "warning" : "neutral";
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Moviment · {formatDate(row.transaction.transactionDate)}</p>
          <p className="truncate font-medium" title={row.transaction.rawDescription}>{row.transaction.rawDescription}</p>
          <p className="text-sm tabular-nums">{euros(row.transaction.amountCents)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Factura · {formatDate(row.invoice.invoiceDate)}</p>
          <p className="truncate font-medium">{row.invoice.vendorName ?? "Proveïdor desconegut"}</p>
          <p className="text-sm tabular-nums">{euros(row.invoice.totalAmountCents)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <StatusBadge tone={tone}>Confiança {row.confidenceScore.replace(".", ",")}</StatusBadge>
          <p className="text-xs text-muted-foreground tabular-nums">
            import {row.breakdown.amount.score} · data {row.breakdown.date.score} · text {row.breakdown.text.score} · NIF {row.breakdown.vendor.score}
          </p>
        </div>
        {action}
      </div>
    </li>
  );
}
