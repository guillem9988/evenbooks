"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  FileTextIcon,
  PencilIcon,
  ReceiptIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditExpenseDialog, type ExpenseItem } from "@/components/edit-expense-dialog";
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
import { useT } from "@/i18n";
import { api, apiPath } from "@/lib/api";
import { euros } from "@/lib/money";

const CATEGORIES = [
  ["OFFICE", "expenses.catOffice"],
  ["TRAVEL", "expenses.catTravel"],
  ["SOFTWARE", "expenses.catSoftware"],
  ["MEALS", "expenses.catMeals"],
  ["OTHER", "expenses.catOther"],
] as const;

type Filter = "ALL" | "UNCATEGORIZED" | "PENDING" | "FAILED";

export default function ExpensesPage() {
  const t = useT();
  const organizationId = useOrganizationId();
  const [uploading, setUploading] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const body = await api<{ expenses: ExpenseItem[] }>(`/organizations/${organizationId}/expenses`);
    return body.expenses;
  }, [organizationId]);

  const { data, setData, error, initialLoading, loading, reload } = useLoad(load, t("expenses.loadFailed"));
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

  const filteredByStatus =
    filter === "UNCATEGORIZED" ? uncategorized : filter === "FAILED" ? failed : filter === "PENDING" ? pending : rows;

  const visible = filteredByStatus.filter((row) => {
    if (dateFrom && row.invoiceDate && row.invoiceDate < dateFrom) return false;
    if (dateTo && row.invoiceDate && row.invoiceDate > dateTo) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchVendor = row.vendorName?.toLowerCase().includes(q) ?? false;
      const matchTaxId = row.vendorTaxId?.toLowerCase().includes(q) ?? false;
      const matchNumber = row.invoiceNumber?.toLowerCase().includes(q) ?? false;
      const matchFile = row.originalFilename?.toLowerCase().includes(q) ?? false;
      const matchAmount = row.totalAmountCents ? (Number(row.totalAmountCents) / 100).toFixed(2).includes(q) : false;
      if (!matchVendor && !matchTaxId && !matchNumber && !matchFile && !matchAmount) return false;
    }

    return true;
  });

  async function upload(files: File[]) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const body = await api<{ invoiceIds: string[] }>(`/organizations/${organizationId}/invoices`, { method: "POST", body: form });
    notifySuccess(body.invoiceIds.length === 1 ? t("expenses.uploadedOne") : t("expenses.uploadedMany", { count: body.invoiceIds.length }));
    await reload();
  }

  async function reprocessInvoice(invoiceId: string) {
    setReprocessingId(invoiceId);
    try {
      await api(`/organizations/${organizationId}/invoices/${invoiceId}/reprocess`, { method: "POST" });
      notifySuccess(t("expenses.reprocessSuccess"));
      await reload();
    } catch (cause) {
      notifyError(cause, t("expenses.reprocessFailed"));
    } finally {
      setReprocessingId(null);
    }
  }

  async function saveCategory(row: ExpenseItem, expenseCategory: string) {
    setSaving(row.id);
    try {
      await api(`/organizations/${organizationId}/invoices/${row.id}`, { method: "PATCH", body: JSON.stringify({ expenseCategory }) });
      setData((current) => current?.map((item) => (item.id === row.id ? { ...item, expenseCategory } : item)) ?? current);
      notifySuccess(t("expenses.categorySaved", { name: row.vendorName ?? t("expenses.theExpense") }));
    } catch (cause) {
      notifyError(cause, t("expenses.categoryFailed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("expenses.title")}
        description={t("expenses.description")}
        actions={
          <>
            <Link href="/configuracio" className={buttonVariants({ variant: "outline" })}>
              <SparklesIcon /> {t("expenses.configureAi")}
            </Link>
            <Button variant="outline" onClick={() => void reload()} disabled={loading}>
              <RefreshCwIcon /> {t("expenses.refresh")}
            </Button>
            <Button onClick={() => setUploading(true)}>
              <UploadIcon /> {t("expenses.upload")}
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <>
          <CardsSkeleton count={3} className="lg:grid-cols-3" />
          <TableSkeleton columns={7} />
        </>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard label={t("expenses.totalParsed")} value={euros(sumCents(parsed.map((row) => row.totalAmountCents)))} hint={t("expenses.totalParsedHint", { count: parsed.length })} />
            <KpiCard label={t("expenses.vatSupported")} value={euros(sumCents(parsed.map((row) => row.taxAmountCents)))} hint={t("expenses.vatSupportedHint")} />
            <KpiCard
              label={t("expenses.toReview")}
              value={String(uncategorized.length + failed.length)}
              hint={t("expenses.toReviewHint", { uncat: uncategorized.length, failed: failed.length })}
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={ReceiptIcon}
              title={t("expenses.empty")}
              hint={t("expenses.emptyHint")}
              action={
                <Button onClick={() => setUploading(true)}>
                  <UploadIcon /> {t("expenses.upload")}
                </Button>
              }
            />
          ) : (
            <section aria-label={t("expenses.listLabel")} className="flex flex-col gap-3">
              <Segmented
                label={t("expenses.filter")}
                value={filter}
                onChange={setFilter}
                options={[
                  ["ALL", t("expenses.all"), rows.length],
                  ["UNCATEGORIZED", t("expenses.uncategorized"), uncategorized.length],
                  ["PENDING", t("expenses.analyzing"), pending.length],
                  ["FAILED", t("expenses.unreadable"), failed.length],
                ]}
              />

              <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1">
                  <SearchIcon className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("expenses.searchPlaceholder")}
                    className="pl-8 text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{t("expenses.dateFrom")}:</span>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-8 w-auto text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>{t("expenses.dateTo")}:</span>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-8 w-auto text-xs"
                    />
                  </div>
                  {searchQuery || dateFrom || dateTo ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <XIcon className="mr-1 size-3.5" />
                      {t("expenses.clearFilters")}
                    </Button>
                  ) : null}
                </div>
              </div>

              {(searchQuery || dateFrom || dateTo || filter !== "ALL") ? (
                <p className="text-xs text-muted-foreground">
                  {t("expenses.showingCount", { visible: visible.length, total: rows.length })}
                </p>
              ) : null}

              {inFlight ? (
                <p className="text-sm text-muted-foreground" role="status">
                  {t("expenses.analyzingNote")}
                </p>
              ) : null}
              {visible.length === 0 ? (
                <EmptyState title={t("expenses.emptyFilter")} />
              ) : (
                <>
                  <div className="hidden overflow-hidden rounded-xl border md:block">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>{t("expenses.vendor")}</TableHead>
                          <TableHead>{t("common.date")}</TableHead>
                          <TableHead className="text-right">{t("common.vat")}</TableHead>
                          <TableHead className="text-right">{t("common.total")}</TableHead>
                          <TableHead>{t("common.status")}</TableHead>
                          <TableHead className="w-44">{t("expenses.category")}</TableHead>
                          <TableHead className="w-24 text-right">{t("common.actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visible.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">
                              {row.vendorName ?? <span className="text-muted-foreground">{t("expenses.vendorPending")}</span>}
                              {row.vendorTaxId ? <span className="block text-xs font-normal text-muted-foreground">{row.vendorTaxId}</span> : null}
                              {row.invoiceNumber ? <span className="block text-xs font-normal text-muted-foreground">{row.invoiceNumber}</span> : null}
                            </TableCell>
                            <TableCell>{formatDate(row.invoiceDate)}</TableCell>
                            <TableCell className="text-right tabular-nums">{euros(row.taxAmountCents)}</TableCell>
                            <TableCell className="text-right font-medium tabular-nums">{euros(row.totalAmountCents)}</TableCell>
                            <TableCell>
                              <div className="flex flex-col items-start gap-1">
                                <ExpenseStatusBadge status={row.status} />
                                {row.status === "FAILED" ? (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      disabled={reprocessingId === row.id}
                                      onClick={() => void reprocessInvoice(row.id)}
                                      title={t("expenses.reprocess")}
                                    >
                                      <RotateCcwIcon className={reprocessingId === row.id ? "animate-spin" : ""} />
                                      <span className="hidden xl:inline">
                                        {reprocessingId === row.id ? t("expenses.reprocessing") : t("expenses.reprocess")}
                                      </span>
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="xs"
                                      onClick={() => setEditingExpense(row)}
                                      title={t("expenses.manualEntry")}
                                    >
                                      <PencilIcon className="size-3" />
                                      <span className="hidden xl:inline">{t("expenses.manualEntry")}</span>
                                    </Button>
                                  </div>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              <CategorySelect row={row} disabled={saving === row.id} onSave={saveCategory} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                {row.hasFile !== false ? (
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    title={t("expenses.viewDocument")}
                                    onClick={() => window.open(apiPath(`/organizations/${organizationId}/invoices/${row.id}/file`), "_blank", "noopener,noreferrer")}
                                  >
                                    <FileTextIcon className="size-3.5" />
                                  </Button>
                                ) : null}
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  title={t("expenses.editExpense")}
                                  onClick={() => setEditingExpense(row)}
                                >
                                  <PencilIcon className="size-3.5" />
                                </Button>
                              </div>
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
                            <p className="truncate font-medium">{row.vendorName ?? t("expenses.vendorPending")}</p>
                            {row.vendorTaxId ? <p className="text-xs text-muted-foreground">{row.vendorTaxId}</p> : null}
                            <p className="text-sm text-muted-foreground">{formatDate(row.invoiceDate)}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <ExpenseStatusBadge status={row.status} />
                            {row.status === "FAILED" ? (
                              <Button
                                variant="ghost"
                                size="xs"
                                disabled={reprocessingId === row.id}
                                onClick={() => void reprocessInvoice(row.id)}
                              >
                                <RotateCcwIcon className={reprocessingId === row.id ? "animate-spin" : ""} />
                                {reprocessingId === row.id ? t("expenses.reprocessing") : t("expenses.reprocess")}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-lg font-semibold tabular-nums">{euros(row.totalAmountCents)}</p>
                          <div className="w-40">
                            <CategorySelect row={row} disabled={saving === row.id} onSave={saveCategory} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between border-t pt-2 mt-0.5">
                          <div>
                            {row.hasFile !== false ? (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => window.open(apiPath(`/organizations/${organizationId}/invoices/${row.id}/file`), "_blank", "noopener,noreferrer")}
                              >
                                <FileTextIcon className="size-3" />
                                {t("expenses.viewDocument")}
                              </Button>
                            ) : null}
                          </div>
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => setEditingExpense(row)}
                          >
                            <PencilIcon className="size-3" />
                            {t("common.edit")}
                          </Button>
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

      <EditExpenseDialog
        open={Boolean(editingExpense)}
        onOpenChange={(open) => !open && setEditingExpense(null)}
        expense={editingExpense}
        organizationId={organizationId}
        onSaved={(updated) => {
          setData((current) => current?.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) ?? current);
        }}
        onDeleted={(id) => {
          setData((current) => current?.filter((item) => item.id !== id) ?? current);
        }}
      />

      <UploadDialog
        open={uploading}
        onOpenChange={setUploading}
        title={t("expenses.uploadTitle")}
        description={t("expenses.uploadDescription")}
        accept="application/pdf,image/png,image/jpeg"
        extensions={[".pdf", ".png", ".jpg", ".jpeg"]}
        multiple
        submitLabel={(count) => (count > 1 ? t("expenses.uploadMany", { count }) : t("expenses.uploadOne"))}
        onUpload={upload}
      />
    </>
  );
}

function CategorySelect({ row, disabled, onSave }: { row: ExpenseItem; disabled: boolean; onSave: (row: ExpenseItem, category: string) => void }) {
  const t = useT();
  if (row.status !== "PARSED") {
    return <span className="text-xs text-muted-foreground">{t("expenses.whenAnalyzed")}</span>;
  }
  return (
    <NativeSelect
      aria-label={t("expenses.categoryOf", { name: row.vendorName ?? t("expenses.theExpense") })}
      value={row.expenseCategory ?? ""}
      disabled={disabled}
      onChange={(event) => event.target.value && onSave(row, event.target.value)}
    >
      <option value="" disabled>
        {t("expenses.noCategory")}
      </option>
      {CATEGORIES.map(([code, key]) => (
        <option key={code} value={code}>
          {t(key)}
        </option>
      ))}
    </NativeSelect>
  );
}
