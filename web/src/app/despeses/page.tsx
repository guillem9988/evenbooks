"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationId } from "@/components/shell";
import { EmptyState, ErrorBanner, LoadingRows, NativeSelect, PageHeader, StatusBadge, formatDate, messageOf } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";

const CATEGORIES = [
  ["OFFICE", "Oficina"],
  ["TRAVEL", "Viatges"],
  ["SOFTWARE", "Programari"],
  ["MEALS", "Àpats"],
  ["OTHER", "Altres"],
] as const;

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  PARSED: { label: "Analitzada", tone: "success" },
  PROCESSING: { label: "Processant", tone: "warning" },
  UPLOADED: { label: "Pujada", tone: "neutral" },
  FAILED: { label: "Error", tone: "danger" },
};

interface Expense {
  id: string;
  vendorName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: string;
  totalAmountCents: string | null;
  taxAmountCents: string | null;
  expenseCategory: string | null;
}

export default function ExpensesPage() {
  const organizationId = useOrganizationId();
  const [rows, setRows] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await api<{ expenses: Expense[] }>(`/organizations/${organizationId}/expenses`);
      setRows(body.expenses);
    } catch (cause) {
      setError(messageOf(cause, "No s'han pogut carregar les despeses"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveCategory(invoice: Expense, expenseCategory: string) {
    setError(null);
    try {
      await api(`/organizations/${organizationId}/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expenseCategory }),
      });
      setRows((current) => current.map((row) => (row.id === invoice.id ? { ...row, expenseCategory } : row)));
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut desar la categoria"));
    }
  }

  return (
    <>
      <PageHeader
        title="Despeses"
        description="Factures rebudes i analitzades. Classifica-les per veure on va la despesa."
        actions={<Button variant="outline" render={<Link href="/banc" />}>Puja factures al Banc</Button>}
      />
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <LoadingRows rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState title="Encara no hi ha factures rebudes" hint="Puja PDF o fotos de tiquets des de la secció Banc." />
      ) : (
        <>
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveïdor</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estat</TableHead>
                  <TableHead className="w-44">Categoria</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {row.vendorName ?? "Proveïdor pendent"}
                      {row.invoiceNumber ? <span className="block text-xs font-normal text-muted-foreground">{row.invoiceNumber}</span> : null}
                    </TableCell>
                    <TableCell>{formatDate(row.invoiceDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{euros(row.taxAmountCents)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{euros(row.totalAmountCents)}</TableCell>
                    <TableCell><ExpenseStatus status={row.status} /></TableCell>
                    <TableCell><CategorySelect row={row} onSave={saveCategory} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{row.vendorName ?? "Proveïdor pendent"}</p>
                    <p className="text-sm text-muted-foreground">{formatDate(row.invoiceDate)}</p>
                  </div>
                  <ExpenseStatus status={row.status} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold tabular-nums">{euros(row.totalAmountCents)}</p>
                  <div className="w-40"><CategorySelect row={row} onSave={saveCategory} /></div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function ExpenseStatus({ status }: { status: string }) {
  const entry = STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <StatusBadge tone={entry.tone}>{entry.label}</StatusBadge>;
}

function CategorySelect({ row, onSave }: { row: Expense; onSave: (row: Expense, category: string) => void }) {
  if (row.status !== "PARSED") {
    return <span className="text-xs text-muted-foreground">Disponible quan s’analitzi</span>;
  }
  return (
    <NativeSelect
      aria-label="Categoria"
      value={row.expenseCategory ?? ""}
      onChange={(event) => event.target.value && onSave(row, event.target.value)}
    >
      <option value="" disabled>Sense categoria</option>
      {CATEGORIES.map(([code, label]) => (
        <option key={code} value={code}>{label}</option>
      ))}
    </NativeSelect>
  );
}
