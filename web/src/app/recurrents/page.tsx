"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { PauseIcon, PencilIcon, PlayIcon, PlusIcon, RepeatIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LineEditor, emptyLine, lineTotals, validateLines, type CatalogPick, type DraftLine, type LineErrors } from "@/components/line-editor";
import { useOrganizationId } from "@/components/shell";
import { ActiveBadge } from "@/components/status-badges";
import {
  EmptyState,
  ErrorBanner,
  Field,
  FormDialog,
  NativeSelect,
  PageHeader,
  TableSkeleton,
  notifyError,
  notifySuccess,
  useLoad,
} from "@/components/ui-kit";
import { useT } from "@/i18n";
import { monthsFor } from "@/i18n/core";
import { api } from "@/lib/api";
import { euroInput, euros } from "@/lib/money";

interface Contact {
  id: string;
  legalName: string;
  role: string;
}

interface Series {
  id: string;
  contactId: string;
  contactName: string;
  dayOfMonth: number;
  active: boolean;
  lines: Array<{ description: string; quantity: number; unitAmountCents: string; taxRate: number | null }>;
}

interface RecurringData {
  contacts: Contact[];
  catalog: CatalogPick[];
  series: Series[];
}

export default function RecurringPage() {
  const t = useT();
  const organizationId = useOrganizationId();
  const [creating, setCreating] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);
  const [deletingSeries, setDeletingSeries] = useState<Series | null>(null);
  const [running, setRunning] = useState(false);
  const [contactId, setContactId] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [lineErrors, setLineErrors] = useState<LineErrors>([]);
  const [errors, setErrors] = useState<{ contactId?: string; dayOfMonth?: string }>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (): Promise<RecurringData> => {
    const [people, products, listed] = await Promise.all([
      api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`),
      api<{ items: CatalogPick[] }>(`/organizations/${organizationId}/catalog`),
      api<{ recurringInvoices: Series[] }>(`/organizations/${organizationId}/recurring-invoices`),
    ]);
    return { contacts: people.contacts.filter((contact) => contact.role === "CLIENT"), catalog: products.items, series: listed.recurringInvoices };
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, t("recurring.loadFailed"));
  const series = data?.series ?? [];
  const contacts = data?.contacts ?? [];
  const activeCount = series.filter((row) => row.active).length;
  const monthName = monthsFor()[new Date().getMonth()];

  function openCreate() {
    setContactId("");
    setDayOfMonth("1");
    setLines([emptyLine()]);
    setLineErrors([]);
    setErrors({});
    setCreating(true);
  }

  function openEdit(row: Series) {
    setEditingSeries(row);
    setContactId(row.contactId);
    setDayOfMonth(String(row.dayOfMonth));
    setLines(
      row.lines.map((line) => ({
        description: line.description,
        quantity: String(line.quantity),
        price: euroInput(line.unitAmountCents),
        taxRate: String(line.taxRate ?? 21),
      })),
    );
    setLineErrors([]);
    setErrors({});
  }

  async function create() {
    const header: typeof errors = {};
    if (contactId === "") header.contactId = t("validation.pickClient");
    const day = Number(dayOfMonth);
    if (!/^\d+$/.test(dayOfMonth.trim()) || day < 1 || day > 28) header.dayOfMonth = t("validation.dayOfMonth");
    const checked = validateLines(lines, {
      concept: t("validation.concept"),
      qtyMin: t("validation.qtyMin"),
      money: { required: t("money.required"), invalid: t("money.invalid"), zero: t("money.zero") },
    });
    setErrors(header);
    setLineErrors(checked.errors);
    if (Object.keys(header).length > 0 || checked.parsed === null) return;
    setBusy("create");
    try {
      await api(`/organizations/${organizationId}/recurring-invoices`, {
        method: "POST",
        body: JSON.stringify({ contactId, dayOfMonth: day, lines: checked.parsed }),
      });
      notifySuccess(t("recurring.created"));
      setCreating(false);
      await reload();
    } catch (cause) {
      notifyError(cause, t("recurring.createFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function update() {
    if (!editingSeries) return;
    const header: typeof errors = {};
    if (contactId === "") header.contactId = t("validation.pickClient");
    const day = Number(dayOfMonth);
    if (!/^\d+$/.test(dayOfMonth.trim()) || day < 1 || day > 28) header.dayOfMonth = t("validation.dayOfMonth");
    const checked = validateLines(lines, {
      concept: t("validation.concept"),
      qtyMin: t("validation.qtyMin"),
      money: { required: t("money.required"), invalid: t("money.invalid"), zero: t("money.zero") },
    });
    setErrors(header);
    setLineErrors(checked.errors);
    if (Object.keys(header).length > 0 || checked.parsed === null) return;
    setBusy("update");
    try {
      await api(`/organizations/${organizationId}/recurring-invoices/${editingSeries.id}`, {
        method: "PATCH",
        body: JSON.stringify({ contactId, dayOfMonth: day, lines: checked.parsed }),
      });
      notifySuccess(t("recurring.updated"));
      setEditingSeries(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("recurring.editFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!deletingSeries) return;
    setBusy("delete");
    try {
      await api(`/organizations/${organizationId}/recurring-invoices/${deletingSeries.id}`, {
        method: "DELETE",
      });
      notifySuccess(t("recurring.deleteSuccess"));
      setDeletingSeries(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("recurring.deleteFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function toggle(row: Series) {
    setBusy(row.id);
    try {
      await api(`/organizations/${organizationId}/recurring-invoices/${row.id}/pause`, { method: "POST" });
      notifySuccess(row.active ? t("recurring.paused", { name: row.contactName }) : t("recurring.activated", { name: row.contactName }));
      await reload();
    } catch (cause) {
      notifyError(cause, t("recurring.toggleFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy("run");
    try {
      const body = await api<{ created: unknown[] }>(`/organizations/${organizationId}/recurring-invoices/run`, { method: "POST" });
      notifySuccess(
        body.created.length === 0
          ? t("recurring.alreadyGenerated")
          : body.created.length === 1
            ? t("recurring.generatedOne")
            : t("recurring.generatedMany", { count: body.created.length }),
      );
      setRunning(false);
    } catch (cause) {
      notifyError(cause, t("recurring.generateFailed"));
    } finally {
      setBusy(null);
    }
  }

  const monthly = (row: Series) => {
    const draft = row.lines.map((line) => ({
      description: line.description,
      quantity: String(line.quantity),
      price: euroInput(line.unitAmountCents),
      taxRate: String(line.taxRate ?? 0),
    }));
    const totals = lineTotals(draft);
    return euros(totals.base + totals.tax);
  };

  const rowActions = (row: Series) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy !== null}
        onClick={() => toggle(row)}
      >
        {row.active ? (
          <>
            <PauseIcon /> {t("recurring.pause")}
          </>
        ) : (
          <>
            <PlayIcon /> {t("recurring.activate")}
          </>
        )}
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={busy !== null}
        aria-label={t("recurring.editSeries")}
        title={t("recurring.editSeries")}
        onClick={() => openEdit(row)}
      >
        <PencilIcon className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={busy !== null}
        aria-label={t("recurring.deleteSeries")}
        title={t("recurring.deleteSeries")}
        onClick={() => setDeletingSeries(row)}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("recurring.title")}
        description={t("recurring.description")}
        actions={
          <>
            <Button variant="outline" onClick={() => setRunning(true)} disabled={initialLoading || activeCount === 0}>
              <RepeatIcon /> {t("recurring.generateMonth", { month: monthName })}
            </Button>
            <Button onClick={openCreate} disabled={initialLoading || contacts.length === 0}>
              <PlusIcon /> {t("recurring.newSeries")}
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <TableSkeleton columns={5} rows={3} />
      ) : data ? (
        contacts.length === 0 && series.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={t("recurring.needClient")}
            hint={t("recurring.needClientHint")}
            action={<Button render={<Link href="/contactes?nou=1" />}>{t("recurring.addClient")}</Button>}
          />
        ) : series.length === 0 ? (
          <EmptyState
            icon={RepeatIcon}
            title={t("recurring.empty")}
            hint={t("recurring.emptyHint")}
            action={
              <Button onClick={openCreate}>
                <PlusIcon /> {t("recurring.newSeries")}
              </Button>
            }
          />
        ) : (
          <section aria-label={t("recurring.listLabel")} className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {activeCount === 1
                ? t("recurring.activeOne", { total: series.length })
                : t("recurring.activeMany", { count: activeCount, total: series.length })}
            </p>
            <div className="hidden overflow-hidden rounded-xl border md:block">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead>{t("common.client")}</TableHead>
                    <TableHead>{t("recurring.concept")}</TableHead>
                    <TableHead>{t("recurring.dayCol")}</TableHead>
                    <TableHead className="text-right">{t("recurring.monthlyTotal")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">{t("common.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.contactName}</TableCell>
                      <TableCell className="max-w-64 truncate text-muted-foreground" title={row.lines.map((line) => line.description).join(", ")}>
                        {row.lines.map((line) => line.description).join(", ")}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {t("common.day")} {row.dayOfMonth}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{monthly(row)}</TableCell>
                      <TableCell>
                        <ActiveBadge active={row.active} />
                      </TableCell>
                      <TableCell className="text-right">{rowActions(row)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {series.map((row) => (
                <li key={row.id} className="flex flex-col gap-3 rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{row.contactName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {t("common.day")} {row.dayOfMonth} · {row.lines.map((line) => line.description).join(", ")}
                      </p>
                    </div>
                    <ActiveBadge active={row.active} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-lg font-semibold tabular-nums">{monthly(row)}</p>
                    {rowActions(row)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("recurring.dialogTitle")}
        description={t("recurring.dialogDescription")}
        submitLabel={t("recurring.dialogSubmit")}
        busy={busy === "create"}
        onSubmit={create}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field id="rec-contact" label={t("common.client")} error={errors.contactId}>
            <NativeSelect id="rec-contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">{t("recurring.pickClient")}</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.legalName}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="rec-day" label={t("recurring.dayOfMonth")} error={errors.dayOfMonth} hint={t("recurring.dayHint")}>
            <Input id="rec-day" inputMode="numeric" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} />
          </Field>
        </div>
        <LineEditor idPrefix="rec" lines={lines} onChange={setLines} errors={lineErrors} catalog={data?.catalog ?? []} />
      </FormDialog>

      <FormDialog
        open={editingSeries !== null}
        onOpenChange={(next) => !next && setEditingSeries(null)}
        title={t("recurring.editTitle")}
        description={t("recurring.dialogDescription")}
        submitLabel={t("recurring.updated")}
        busy={busy === "update"}
        onSubmit={update}
        wide
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <Field id="edit-rec-contact" label={t("common.client")} error={errors.contactId}>
            <NativeSelect id="edit-rec-contact" value={contactId} onChange={(event) => setContactId(event.target.value)}>
              <option value="">{t("recurring.pickClient")}</option>
              {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.legalName}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="edit-rec-day" label={t("recurring.dayOfMonth")} error={errors.dayOfMonth} hint={t("recurring.dayHint")}>
            <Input id="edit-rec-day" inputMode="numeric" value={dayOfMonth} onChange={(event) => setDayOfMonth(event.target.value)} />
          </Field>
        </div>
        <LineEditor idPrefix="edit-rec" lines={lines} onChange={setLines} errors={lineErrors} catalog={data?.catalog ?? []} />
      </FormDialog>

      <FormDialog
        open={deletingSeries !== null}
        onOpenChange={(next) => !next && setDeletingSeries(null)}
        title={t("recurring.deleteTitle")}
        description={deletingSeries ? `${deletingSeries.contactName} · ${t("common.day")} ${deletingSeries.dayOfMonth} (${monthly(deletingSeries)})` : undefined}
        submitLabel={t("recurring.deleteSeries")}
        destructive
        busy={busy === "delete"}
        onSubmit={remove}
      >
        <p className="text-sm text-muted-foreground">{t("recurring.deleteConfirm")}</p>
      </FormDialog>

      <FormDialog
        open={running}
        onOpenChange={setRunning}
        title={t("recurring.runTitle", { month: monthName })}
        description={t("recurring.runDescription", { count: activeCount })}
        submitLabel={t("recurring.runSubmit")}
        busy={busy === "run"}
        onSubmit={run}
      />
    </>
  );
}
