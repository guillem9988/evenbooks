"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:43123";
const ORG_KEY = "matchinvoice-organization-id";

interface BankLine {
  id: string;
  transactionDate: string;
  amountCents: string;
  currency: string;
  rawDescription: string;
  matchStatus: string;
}

interface InvoiceLine {
  id: string;
  vendorName: string | null;
  vendorTaxId: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmountCents: string | null;
  currency: string | null;
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
  isAutoConfirmed: boolean;
}

interface ReviewPayload {
  suggestions: Suggestion[];
  autoMatched: AutoMatch[];
}

function euros(cents: string | null): string {
  if (cents === null || cents === "") {
    return "—";
  }
  const negative = cents.startsWith("-");
  const digits = (negative ? cents.slice(1) : cents).replace(/\D/g, "") || "0";
  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2);
  const fraction = padded.slice(-2);
  return `${negative ? "-" : ""}${whole}.${fraction} €`;
}

export function ReviewDesk() {
  const [organizationId, setOrganizationId] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [statement, setStatement] = useState<File | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<FileList | null>(null);
  const [from, setFrom] = useState("2026-01-01");
  const [to, setTo] = useState("2026-12-31");
  const [review, setReview] = useState<ReviewPayload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(ORG_KEY);
    if (saved) {
      setOrganizationId(saved);
    }
  }, []);

  const remember = (id: string) => {
    setOrganizationId(id);
    window.localStorage.setItem(ORG_KEY, id);
  };

  const loadReview = useCallback(async (id: string) => {
    setBusy("review");
    setError(null);
    try {
      const response = await fetch(`${API_URL}/organizations/${id}/reconciliation/review`);
      const body = (await response.json()) as ReviewPayload & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not load the review queue");
      }
      setReview({ suggestions: body.suggestions ?? [], autoMatched: body.autoMatched ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the review queue");
    } finally {
      setBusy(null);
    }
  }, []);

  async function createOrganization(event: React.FormEvent) {
    event.preventDefault();
    setBusy("org");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`${API_URL}/organizations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ legalName, taxId }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        throw new Error(body.error ?? "Could not create the organization");
      }
      remember(body.id);
      setReview(null);
      setNotice(`Organization ${body.id} is ready.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the organization");
    } finally {
      setBusy(null);
    }
  }

  async function uploadStatement() {
    if (!organizationId || statement === null) {
      return;
    }
    setBusy("statement");
    setError(null);
    const data = new FormData();
    data.set("file", statement);
    try {
      const response = await fetch(`${API_URL}/organizations/${organizationId}/statements`, {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as { totalTransactions?: number; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Statement upload failed");
      }
      const count = body.totalTransactions ?? 0;
      setImportedCount(count);
      setNotice(`Imported ${count} bank lines.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Statement upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function uploadInvoices() {
    if (!organizationId || invoices === null || invoices.length === 0) {
      return;
    }
    setBusy("invoices");
    setError(null);
    const data = new FormData();
    for (const file of invoices) {
      data.append("files", file);
    }
    try {
      const response = await fetch(`${API_URL}/organizations/${organizationId}/invoices`, {
        method: "POST",
        body: data,
      });
      const body = (await response.json()) as { invoiceIds?: string[]; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Invoice upload failed");
      }
      setNotice(`Queued ${body.invoiceIds?.length ?? 0} invoice${body.invoiceIds?.length === 1 ? "" : "s"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invoice upload failed");
    } finally {
      setBusy(null);
    }
  }

  async function runReconcile() {
    if (!organizationId) {
      return;
    }
    setBusy("reconcile");
    setError(null);
    try {
      const response = await fetch(`${API_URL}/organizations/${organizationId}/reconcile`, { method: "POST" });
      const body = (await response.json()) as { error?: string; confirmed?: unknown[]; suggestions?: unknown[] };
      if (!response.ok) {
        throw new Error(body.error ?? "Reconciliation failed");
      }
      setNotice(
        `Reconciled ${body.confirmed?.length ?? 0} auto-match${body.confirmed?.length === 1 ? "" : "es"} and ${body.suggestions?.length ?? 0} suggestion${body.suggestions?.length === 1 ? "" : "s"}.`,
      );
      await loadReview(organizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Reconciliation failed");
      setBusy(null);
    }
  }

  async function confirmSuggestion(suggestion: Suggestion) {
    setBusy(suggestion.transaction.id);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/organizations/${organizationId}/reconciliation/matches`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId: suggestion.transaction.id, invoiceId: suggestion.invoice.id }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not confirm the suggestion");
      }
      setNotice("Suggestion confirmed.");
      await loadReview(organizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm the suggestion");
      setBusy(null);
    }
  }

  async function rejectMatch(matchId: string) {
    setBusy(matchId);
    setError(null);
    try {
      const response = await fetch(
        `${API_URL}/organizations/${organizationId}/reconciliation/matches/${matchId}/reject`,
        { method: "POST" },
      );
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not reject the match");
      }
      setNotice("Match rejected. The bank line is unmatched again.");
      await loadReview(organizationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reject the match");
      setBusy(null);
    }
  }

  function downloadZip() {
    if (!organizationId) {
      return;
    }
    const url = `${API_URL}/organizations/${organizationId}/reports/accountant-export?from=${from}&to=${to}`;
    window.location.assign(url);
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">MatchInvoice</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Banc</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Puja l'extracte i les factures, concilia i confirma o rebutja els suggeriments.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{notice}</p> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Legal name and NIF or CIF. The id is kept in this browser.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={createOrganization}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="legalName">Legal name</Label>
                <Input id="legalName" value={legalName} onChange={(event) => setLegalName(event.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="taxId">NIF / CIF</Label>
                <Input id="taxId" value={taxId} onChange={(event) => setTaxId(event.target.value)} required />
              </div>
              <Button type="submit" disabled={busy !== null}>
                {busy === "org" ? "Creating…" : "Create organization"}
              </Button>
            </form>
            {organizationId ? (
              <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{organizationId}</p>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No organization yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Imports</CardTitle>
            <CardDescription>CSV, OFX, QFX, or Excel statement, then PDF or image invoices.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="statement">Bank statement</Label>
              <Input
                id="statement"
                type="file"
                accept=".csv,.ofx,.qfx,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/x-ofx"
                disabled={!organizationId}
                onChange={(event) => setStatement(event.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" disabled={!organizationId || statement === null || busy !== null} onClick={uploadStatement}>
                {busy === "statement" ? "Pujant…" : "Puja l'extracte"}
              </Button>
              {importedCount !== null ? (
                <p className="text-sm text-muted-foreground">Imported {importedCount} transactions.</p>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invoices">Invoices</Label>
              <Input
                id="invoices"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                multiple
                disabled={!organizationId}
                onChange={(event) => setInvoices(event.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!organizationId || invoices === null || invoices.length === 0 || busy !== null}
                onClick={uploadInvoices}
              >
                {busy === "invoices" ? "Pujant…" : "Puja factures"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <CardDescription>Auto-matched rows are stored. Suggestions stay unstored until you confirm them.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" disabled={!organizationId || busy !== null} onClick={runReconcile}>
              {busy === "reconcile" || busy === "review" ? "Treballant…" : "Concilia"}
            </Button>
            <Button type="button" variant="outline" disabled={!organizationId || busy !== null} onClick={() => loadReview(organizationId)}>
              Actualitza
            </Button>
          </div>

          {review === null ? (
            <p className="text-sm text-muted-foreground">The queue is empty until you run reconciliation.</p>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Auto-matched</h2>
                {review.autoMatched.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No auto-matched rows.</p>
                ) : (
                  review.autoMatched.map((row) => (
                    <PairCard
                      key={row.id}
                      score={row.confidenceScore}
                      breakdown={row.breakdown}
                      transaction={row.transaction}
                      invoice={row.invoice}
                      action={
                        <Button type="button" variant="destructive" disabled={busy !== null} onClick={() => rejectMatch(row.id)}>
                          {busy === row.id ? "Rebutjant…" : "Rebutja"}
                        </Button>
                      }
                    />
                  ))
                )}
              </section>
              <section className="flex flex-col gap-2">
                <h2 className="text-sm font-medium">Suggestions</h2>
                {review.suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No suggestions in the 0.65–0.88 band.</p>
                ) : (
                  review.suggestions.map((row) => (
                    <PairCard
                      key={`${row.transaction.id}-${row.invoice.id}`}
                      score={row.confidenceScore}
                      breakdown={row.breakdown}
                      transaction={row.transaction}
                      invoice={row.invoice}
                      action={
                        <Button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => confirmSuggestion(row)}
                        >
                          {busy === row.transaction.id ? "Confirmant…" : "Confirma"}
                        </Button>
                      }
                    />
                  ))
                )}
              </section>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accountant ZIP</CardTitle>
          <CardDescription>Transactions in the date range, renamed invoices, and unmatched expenses.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
          <Button type="button" variant="outline" disabled={!organizationId} onClick={downloadZip}>
            Descarrega el ZIP
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function PairCard({
  score,
  breakdown,
  transaction,
  invoice,
  action,
}: {
  score: string;
  breakdown: Breakdown;
  transaction: BankLine;
  invoice: InvoiceLine;
  action: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {invoice.vendorName ?? "Unknown vendor"} · {euros(transaction.amountCents)}
        </p>
        <p className="truncate text-sm text-muted-foreground">{transaction.rawDescription}</p>
        <p className="text-xs text-muted-foreground">
          Bank {transaction.transactionDate} · Invoice {invoice.invoiceDate ?? "—"} · Score {score}
        </p>
        <p className="text-xs text-muted-foreground">
          amount {breakdown.amount.score} · date {breakdown.date.score} · text {breakdown.text.score} · vendor{" "}
          {breakdown.vendor.score}
        </p>
      </div>
      {action}
    </article>
  );
}
