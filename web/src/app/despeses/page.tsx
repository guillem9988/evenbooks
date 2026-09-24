"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrganizationId } from "@/components/shell";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";

const CATEGORIES = [
  ["OFFICE", "Oficina"],
  ["TRAVEL", "Viatges"],
  ["SOFTWARE", "Programari"],
  ["MEALS", "Àpats"],
  ["OTHER", "Altres"],
] as const;

interface Expense {
  id: string;
  vendorName: string | null;
  invoiceDate: string | null;
  status: string;
  totalAmountCents: string | null;
  expenseCategory: string | null;
}

export default function ExpensesPage() {
  const organizationId = useOrganizationId();
  const [rows, setRows] = useState<Expense[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const body = await api<{ expenses: Expense[] }>(`/organizations/${organizationId}/expenses`);
      setRows(body.expenses);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'han pogut carregar les despeses");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  async function saveCategory(invoice: Expense, expenseCategory: string) {
    setError(null);
    try {
      await api(`/organizations/${organizationId}/invoices/${invoice.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expenseCategory }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No s'ha pogut desar la categoria");
    }
  }

  if (!organizationId) return <p className="text-sm text-muted-foreground">Crea l'organització per classificar despeses.</p>;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Despeses rebudes</h1>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Carregant despeses…</p> : null}
      {!loading && rows.length === 0 ? <p className="text-sm text-muted-foreground">Encara no hi ha factures rebudes.</p> : null}
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">{row.vendorName ?? "Proveïdor pendent"}</p>
              <p className="text-sm text-muted-foreground">{row.invoiceDate ?? "Sense data"} · {euros(row.totalAmountCents)} · {row.status}</p>
            </div>
            {row.status === "PARSED" ? (
              <CategoryPicker current={row.expenseCategory} onSave={(category) => saveCategory(row, category)} />
            ) : (
              <p className="text-sm text-muted-foreground">Encara no analitzada</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function CategoryPicker({ current, onSave }: { current: string | null; onSave: (category: string) => void }) {
  const [value, setValue] = useState(current ?? "OTHER");
  return (
    <div className="flex gap-2">
      <select className="h-8 rounded-lg border bg-background px-2 text-sm" value={value} onChange={(event) => setValue(event.target.value)}>
        {CATEGORIES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
      <Button type="button" variant="outline" onClick={() => onSave(value)}>Desa</Button>
    </div>
  );
}
