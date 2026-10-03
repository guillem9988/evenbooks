"use client";

import { useEffect, useState } from "react";
import { CalculatorIcon, ExternalLinkIcon, FileTextIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EuroInput, Field, FormDialog, NativeSelect, notifyError, notifySuccess } from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api, apiPath } from "@/lib/api";
import { euroInput, parseEuroInput } from "@/lib/money";

export interface ExpenseItem {
  id: string;
  vendorName: string | null;
  vendorTaxId?: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  status: string;
  baseAmountCents?: string | null;
  taxAmountCents: string | null;
  totalAmountCents: string | null;
  expenseCategory: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
  hasFile?: boolean;
}

const CATEGORIES = [
  ["OFFICE", "expenses.catOffice"],
  ["TRAVEL", "expenses.catTravel"],
  ["SOFTWARE", "expenses.catSoftware"],
  ["MEALS", "expenses.catMeals"],
  ["OTHER", "expenses.catOther"],
] as const;

export function EditExpenseDialog({
  open,
  onOpenChange,
  expense,
  organizationId,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseItem | null;
  organizationId: string;
  onSaved: (updated: ExpenseItem) => void;
  onDeleted?: (id: string) => void;
}) {
  const t = useT();
  const [vendorName, setVendorName] = useState("");
  const [vendorTaxId, setVendorTaxId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [baseAmount, setBaseAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!expense) return;
    setVendorName(expense.vendorName ?? "");
    setVendorTaxId(expense.vendorTaxId ?? "");
    setInvoiceNumber(expense.invoiceNumber ?? "");
    setInvoiceDate(expense.invoiceDate ?? "");
    setBaseAmount(expense.baseAmountCents ? euroInput(expense.baseAmountCents) : "");
    setTaxAmount(expense.taxAmountCents ? euroInput(expense.taxAmountCents) : "");
    setTotalAmount(expense.totalAmountCents ? euroInput(expense.totalAmountCents) : "");
    setCategory(expense.expenseCategory ?? "");
  }, [expense]);

  function autoCalculateVat() {
    const baseCentsStr = parseEuroInput(baseAmount);
    if (!baseCentsStr) return;
    const base = BigInt(baseCentsStr);
    // 21% standard VAT in Spain
    const vat = (base * 21n + 50n) / 100n;
    const total = base + vat;
    setTaxAmount(euroInput(vat.toString()));
    setTotalAmount(euroInput(total.toString()));
  }

  async function submit() {
    if (!expense) return;
    setBusy(true);

    const baseCents = baseAmount.trim() ? parseEuroInput(baseAmount) : null;
    const taxCents = taxAmount.trim() ? parseEuroInput(taxAmount) : null;
    const totalCents = totalAmount.trim() ? parseEuroInput(totalAmount) : null;

    try {
      const updated = await api<ExpenseItem>(`/organizations/${organizationId}/invoices/${expense.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          vendorName: vendorName.trim() || null,
          vendorTaxId: vendorTaxId.trim() || null,
          invoiceNumber: invoiceNumber.trim() || null,
          invoiceDate: invoiceDate.trim() || null,
          baseAmountCents: baseCents,
          taxAmountCents: taxCents,
          totalAmountCents: totalCents,
          expenseCategory: category.trim() || null,
        }),
      });

      notifySuccess(t("expenses.saveExpenseSuccess"));
      onSaved(updated);
      onOpenChange(false);
    } catch (cause) {
      notifyError(cause, t("expenses.saveExpenseFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!expense) return;
    if (!confirm(t("expenses.deleteConfirm"))) return;
    setDeleting(true);
    try {
      await api(`/organizations/${organizationId}/invoices/${expense.id}`, {
        method: "DELETE",
      });
      notifySuccess(t("expenses.deleteExpenseSuccess"));
      onDeleted?.(expense.id);
      onOpenChange(false);
    } catch (cause) {
      notifyError(cause, t("expenses.deleteExpenseFailed"));
    } finally {
      setDeleting(false);
    }
  }

  if (!expense) return null;

  const fileUrl = apiPath(`/organizations/${organizationId}/invoices/${expense.id}/file`);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("expenses.editExpense")}
      description={t("expenses.editExpenseDescription")}
      submitLabel={t("common.save")}
      busy={busy || deleting}
      onSubmit={submit}
      wide
    >
      {/* File preview banner if document exists */}
      {expense.hasFile !== false ? (
        <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-2.5 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium text-foreground">
              {expense.originalFilename || t("expenses.viewDocument")}
            </span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => window.open(fileUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLinkIcon className="size-3" />
            {t("expenses.viewDocument")}
          </Button>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="expense-vendor" label={t("expenses.vendor")}>
          <Input
            id="expense-vendor"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="Ex. Google Ireland, Repsol, AWS..."
          />
        </Field>

        <Field id="expense-tax-id" label={t("expenses.vendorTaxId")}>
          <Input
            id="expense-tax-id"
            value={vendorTaxId}
            onChange={(e) => setVendorTaxId(e.target.value)}
            placeholder="Ex. B12345678, ESB98765432..."
          />
        </Field>

        <Field id="expense-invoice-number" label={t("expenses.invoiceNumber")}>
          <Input
            id="expense-invoice-number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Ex. F-2026-0042"
          />
        </Field>

        <Field id="expense-invoice-date" label={t("expenses.invoiceDate")}>
          <Input
            id="expense-invoice-date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-xl border p-3 bg-muted/10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("common.amounts")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={autoCalculateVat}
            title={t("expenses.calculateVat")}
          >
            <CalculatorIcon className="size-3.5" />
            {t("expenses.calculateVat")}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="expense-base-amount" label={t("expenses.baseAmount")}>
            <EuroInput
              id="expense-base-amount"
              value={baseAmount}
              onChange={setBaseAmount}
              placeholder="0,00"
            />
          </Field>
          <Field id="expense-tax-amount" label={t("expenses.taxAmount")}>
            <EuroInput
              id="expense-tax-amount"
              value={taxAmount}
              onChange={setTaxAmount}
              placeholder="0,00"
            />
          </Field>
          <Field id="expense-total-amount" label={t("expenses.totalAmount")}>
            <EuroInput
              id="expense-total-amount"
              value={totalAmount}
              onChange={setTotalAmount}
              placeholder="0,00"
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="expense-category" label={t("expenses.category")}>
          <NativeSelect
            id="expense-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">{t("expenses.noCategory")}</option>
            {CATEGORIES.map(([code, key]) => (
              <option key={code} value={code}>
                {t(key)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="flex items-end justify-end">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy || deleting}
            onClick={handleDelete}
          >
            <Trash2Icon className="size-4" />
            {t("expenses.deleteExpense")}
          </Button>
        </div>
      </div>
    </FormDialog>
  );
}

export function ManualExpenseDialog({
  open,
  onOpenChange,
  organizationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onCreated: (created: ExpenseItem) => void;
}) {
  const t = useT();
  const [vendorName, setVendorName] = useState("");
  const [vendorTaxId, setVendorTaxId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [baseAmount, setBaseAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVendorName("");
      setVendorTaxId("");
      setInvoiceNumber("");
      setInvoiceDate(new Date().toISOString().slice(0, 10));
      setBaseAmount("");
      setTaxAmount("");
      setTotalAmount("");
      setCategory("");
      setError(null);
    }
  }, [open]);

  function autoCalculateVat() {
    const baseCentsStr = parseEuroInput(baseAmount);
    if (!baseCentsStr) return;
    const base = BigInt(baseCentsStr);
    const vat = (base * 21n + 50n) / 100n;
    const total = base + vat;
    setTaxAmount(euroInput(vat.toString()));
    setTotalAmount(euroInput(total.toString()));
  }

  async function submit() {
    const totalCents = totalAmount.trim() ? parseEuroInput(totalAmount) : null;
    if (!totalCents || BigInt(totalCents) <= 0n) {
      setError(t("expenses.totalAmount"));
      return;
    }

    setBusy(true);
    setError(null);

    const baseCents = baseAmount.trim() ? parseEuroInput(baseAmount) : null;
    const taxCents = taxAmount.trim() ? parseEuroInput(taxAmount) : null;

    try {
      const created = await api<ExpenseItem>(`/organizations/${organizationId}/expenses`, {
        method: "POST",
        body: JSON.stringify({
          vendorName: vendorName.trim() || null,
          vendorTaxId: vendorTaxId.trim() || null,
          invoiceNumber: invoiceNumber.trim() || null,
          invoiceDate: invoiceDate.trim() || null,
          baseAmountCents: baseCents,
          taxAmountCents: taxCents,
          totalAmountCents: totalCents,
          expenseCategory: category.trim() || null,
        }),
      });

      notifySuccess(t("expenses.newManualSuccess"));
      onCreated(created);
      onOpenChange(false);
    } catch (cause) {
      notifyError(cause, t("expenses.newManualFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("expenses.newManual")}
      description={t("expenses.newManualDescription")}
      submitLabel={t("expenses.newManualSubmit")}
      busy={busy}
      onSubmit={submit}
      wide
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="manual-vendor-name" label={t("expenses.vendor")}>
          <Input
            id="manual-vendor-name"
            value={vendorName}
            onChange={(e) => setVendorName(e.target.value)}
            placeholder="Ex. Autopistes, Restaurant Can Pere, Iberia..."
            autoFocus
          />
        </Field>

        <Field id="manual-tax-id" label={t("expenses.vendorTaxId")}>
          <Input
            id="manual-tax-id"
            value={vendorTaxId}
            onChange={(e) => setVendorTaxId(e.target.value)}
            placeholder="Ex. B12345678, ESB98765432..."
          />
        </Field>

        <Field id="manual-invoice-number" label={t("expenses.invoiceNumber")}>
          <Input
            id="manual-invoice-number"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            placeholder="Ex. T-2026-0042"
          />
        </Field>

        <Field id="manual-invoice-date" label={t("expenses.invoiceDate")}>
          <Input
            id="manual-invoice-date"
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="rounded-xl border p-3 bg-muted/10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t("common.amounts")}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={autoCalculateVat}
            title={t("expenses.calculateVat")}
          >
            <CalculatorIcon className="size-3.5" />
            {t("expenses.calculateVat")}
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="manual-base-amount" label={t("expenses.baseAmount")}>
            <EuroInput
              id="manual-base-amount"
              value={baseAmount}
              onChange={setBaseAmount}
              placeholder="0,00"
            />
          </Field>
          <Field id="manual-tax-amount" label={t("expenses.taxAmount")}>
            <EuroInput
              id="manual-tax-amount"
              value={taxAmount}
              onChange={setTaxAmount}
              placeholder="0,00"
            />
          </Field>
          <Field id="manual-total-amount" label={t("expenses.totalAmount")} error={error}>
            <EuroInput
              id="manual-total-amount"
              value={totalAmount}
              onChange={(v) => {
                setTotalAmount(v);
                setError(null);
              }}
              placeholder="0,00"
            />
          </Field>
        </div>
      </div>

      <Field id="manual-category" label={t("expenses.category")}>
        <NativeSelect
          id="manual-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{t("expenses.noCategory")}</option>
          {CATEGORIES.map(([code, key]) => (
            <option key={code} value={code}>
              {t(key)}
            </option>
          ))}
        </NativeSelect>
      </Field>
    </FormDialog>
  );
}
