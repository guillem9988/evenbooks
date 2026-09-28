"use client";

import { useCallback, useEffect, useState } from "react";
import { ReceiptIcon, RefreshCwIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationId } from "@/components/shell";
import { ExpenseStatusBadge } from "@/components/status-badges";
import {
  CardsSkeleton,
  EmptyState,
  ErrorBanner,
  KpiCard,
  NativeSelect,
  PageHeader,
  Segmented,
  TableSkeleton,
  formatDate,
  notifyError,
  notifySuccess,
  sumCents,
  useLoad,
} from "@/components/ui-kit";
import { UploadDialog } from "@/components/upload-dialog";
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
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: string;
  totalAmountCents: string | null;
  taxAmountCents: string | null;
  expenseCategory: string | null;
}

type Filter = "ALL" | "UNCATEGORIZED" | "PENDING" | "FAILED";

export default function ExpensesPage() {
  const organizationId = useOrganizationId();
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const body = await api<{ expenses: Expense[] }>(`/organizations/${organizationId}/expenses`);
    return body.expenses;
  }, [organizationId]);

  const { data, setData, error, initialLoading, loading, reload } = useLoad(load, "No s’han pogut carregar les despeses");
  const rows = data ?? [];
  const inFlight = rows.some((row) => row.status === "UPLOADED" || row.status === "PROCESSING");

  useEffect(() => {
    if (!inFlight) return;
    const timer = window.setTimeout(() => void reload(), 4000);
    return () => window.clearTimeout(timer);
  }, [inFlight, reload, data]);

  const parsed = rows.filter((row) => row.status === "PARSED");
  const uncategorized = parsed.filter((row) => row.expenseCategory === null);
  const failed = rows.filter((row) => row.status === "FAILED");
  const pending = rows.filter((row) => row.status === "UPLOADED" || row.status === "PROCESSING");
  const visible =
    filter === "UNCATEGORIZED" ? uncategorized : filter === "FAILED" ? failed : filter === "PENDING" ? pending : rows;

  async function upload(files: File[]) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const body = await api<{ invoiceIds: string[] }>(`/organizations/${organizationId}/invoices`, { method: "POST", body: form });
    notifySuccess(`${body.invoiceIds.length} ${body.invoiceIds.length === 1 ? "factura pujada" : "factures pujades"}. S’estan analitzant.`);
    await reload();
  }

  async function saveCategory(row: Expense, expenseCategory: string) {
    setSaving(row.id);
    try {
      await api(`/organizations/${organizationId}/invoices/${row.id}`, { method: "PATCH", body: JSON.stringify({ expenseCategory }) });
      setData((current) => current?.map((item) => (item.id === row.id ? { ...item, expenseCategory } : item)) ?? current);
      notifySuccess(`Categoria desada per a ${row.vendorName ?? "la despesa"}.`);
    } catch (cause) {
      notifyError(cause, "No s’ha pogut desar la categoria");
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Despeses"
        description="Factures i tiquets rebuts. En pujar-los se n’extreuen el proveïdor, la data i els imports."
        actions={
          <>
            <Button variant="outline" onClick={() => void reload()} disabled={loading}>
              <RefreshCwIcon /> Actualitza
            </Button>
            <Button onClick={() => setUploading(true)}>
              <UploadIcon /> Puja factures
            </Button>
          </>
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
            <KpiCard label="Total analitzat" value={euros(sumCents(parsed.map((row) => row.totalAmountCents)))} hint={`${parsed.length} factures llegides`} />
            <KpiCard label="IVA suportat" value={euros(sumCents(parsed.map((row) => row.taxAmountCents)))} hint="Deduïble al model 303" />
            <KpiCard label="Per revisar" value={String(uncategorized.length + failed.length)} hint={`${uncategorized.length} sense categoria · ${failed.length} no llegibles`} />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={ReceiptIcon}
              title="Encara no hi ha factures rebudes"
              hint="Puja PDF o fotos de tiquets. Els PDF amb text es llegeixen al moment; les fotos passen per OCR."
              action={
                <Button onClick={() => setUploading(true)}>
                  <UploadIcon /> Puja factures
                </Button>
              }
            />
          ) : (
            <section aria-label="Factures rebudes" className="flex flex-col gap-3">
              <Segmented
                label="Filtra les despeses"
                value={filter}
                onChange={setFilter}
                options={[
                  ["ALL", "Totes", rows.length],
                  ["UNCATEGORIZED", "Sense categoria", uncategorized.length],
                  ["PENDING", "Analitzant", pending.length],
                  ["FAILED", "No llegibles", failed.length],
                ]}
              />
              {inFlight ? (
                <p className="text-sm text-muted-foreground" role="status">
                  Hi ha factures en anàlisi. La llista s’actualitza sola.
                </p>
              ) : null}
              {visible.length === 0 ? (
                <EmptyState title="Cap despesa amb aquest filtre" />
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border md:block">
                    <Table>
                      <TableHeader className="bg-muted/40">
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
                        {visible.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">
                              {row.vendorName ?? <span className="text-muted-foreground">Proveïdor pendent</span>}
                              {row.invoiceNumber ? <span className="block text-xs font-normal text-muted-foreground">{row.invoiceNumber}</span> : null}
                            </TableCell>
                            <TableCell>{formatDate(row.invoiceDate)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(row.taxAmountCents)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{euros(row.totalAmountCents)}</TableCell>
                            <TableCell>
                              <ExpenseStatusBadge status={row.status} />
                            </TableCell>
                            <TableCell>
                              <CategorySelect row={row} disabled={saving === row.id} onSave={saveCategory} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ul className="flex flex-col gap-2 md:hidden">
                    {visible.map((row) => (
                      <li key={row.id} className="flex flex-col gap-3 rounded-xl border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.vendorName ?? "Proveïdor pendent"}</p>
                            <p className="text-sm text-muted-foreground">{formatDate(row.invoiceDate)}</p>
                          </div>
                          <ExpenseStatusBadge status={row.status} />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold tabular-nums">{euros(row.totalAmountCents)}</p>
                          <div className="w-40">
                            <CategorySelect row={row} disabled={saving === row.id} onSave={saveCategory} />
                          </div>
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

      <UploadDialog
        open={uploading}
        onOpenChange={setUploading}
        title="Puja factures rebudes"
        description="PDF, PNG o JPG. Es desen en privat i se n’extreuen els imports automàticament."
        accept="application/pdf,image/png,image/jpeg"
        extensions={[".pdf", ".png", ".jpg", ".jpeg"]}
        multiple
        submitLabel={(count) => (count > 1 ? `Puja ${count} factures` : "Puja la factura")}
        onUpload={upload}
      />
    </>
  );
}

function CategorySelect({ row, disabled, onSave }: { row: Expense; disabled: boolean; onSave: (row: Expense, category: string) => void }) {
  if (row.status !== "PARSED") {
    return <span className="text-xs text-muted-foreground">Quan s’analitzi</span>;
  }
  return (
    <NativeSelect
      aria-label={`Categoria de ${row.vendorName ?? "la despesa"}`}
      value={row.expenseCategory ?? ""}
      disabled={disabled}
      onChange={(event) => event.target.value && onSave(row, event.target.value)}
    >
      <option value="" disabled>
        Sense categoria
      </option>
      {CATEGORIES.map(([code, label]) => (
        <option key={code} value={code}>
          {label}
        </option>
      ))}
    </NativeSelect>
  );
}
