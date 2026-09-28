"use client";

import { useCallback, useState } from "react";
import { CheckIcon, DownloadIcon, FileSpreadsheetIcon, LandmarkIcon, RefreshCwIcon, SparklesIcon, UploadIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOrganizationId } from "@/components/shell";
import { MatchBadge, type MatchKind } from "@/components/status-badges";
import {
  EmptyState,
  ErrorBanner,
  Field,
  FormDialog,
  LoadingRows,
  PageHeader,
  Section,
  Segmented,
  StatusBadge,
  currentQuarter,
  formatDate,
  notifyError,
  notifySuccess,
  quarterRange,
  useLoad,
} from "@/components/ui-kit";
import { UploadDialog } from "@/components/upload-dialog";
import { useT } from "@/i18n";
import { api, apiPath } from "@/lib/api";
import { euros } from "@/lib/money";

interface BankLine {
  id: string;
  transactionDate: string;
  amountCents: string;
  rawDescription: string;
  matchStatus?: string;
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

type Tab = "suggestions" | "matched";

export function ReviewDesk() {
  const t = useT();
  const organizationId = useOrganizationId();
  const initialRange = quarterRange(currentQuarter());
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rejecting, setRejecting] = useState<AutoMatch | null>(null);
  const [tab, setTab] = useState<Tab>("suggestions");

  const load = useCallback(async (): Promise<ReviewPayload> => {
    const body = await api<ReviewPayload>(`/organizations/${organizationId}/reconciliation/review`);
    return { suggestions: body.suggestions ?? [], autoMatched: body.autoMatched ?? [] };
  }, [organizationId]);

  const { data: review, error, initialLoading, loading, reload } = useLoad(load, t("bank.loadFailed"));

  async function run(key: string, action: () => Promise<string>, fallback: string) {
    setBusy(key);
    try {
      notifySuccess(await action());
    } catch (cause) {
      notifyError(cause, fallback);
    } finally {
      setBusy(null);
    }
  }

  async function uploadStatement(files: File[]) {
    const file = files[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    const body = await api<{ totalTransactions: number }>(`/organizations/${organizationId}/statements`, { method: "POST", body: form });
    notifySuccess(t("bank.imported", { count: body.totalTransactions }));
    await reload();
  }

  async function uploadInvoices(files: File[]) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const body = await api<{ invoiceIds: string[] }>(`/organizations/${organizationId}/invoices`, { method: "POST", body: form });
    notifySuccess(body.invoiceIds.length === 1 ? t("bank.queuedOne") : t("bank.queuedMany", { count: body.invoiceIds.length }));
  }

  const reconcile = () =>
    run(
      "reconcile",
      async () => {
        const body = await api<{ confirmed: unknown[]; suggestions: unknown[] }>(`/organizations/${organizationId}/reconcile`, { method: "POST" });
        await reload();
        return t("bank.reconcileDone", { auto: body.confirmed.length, suggestions: body.suggestions.length });
      },
      t("bank.reconcileFailed"),
    );

  const confirm = (row: Suggestion) =>
    run(
      row.transaction.id,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/matches`, {
          method: "POST",
          body: JSON.stringify({ transactionId: row.transaction.id, invoiceId: row.invoice.id }),
        });
        await reload();
        return t("bank.confirmed");
      },
      t("bank.confirmFailed"),
    );

  async function reject() {
    if (rejecting === null) return;
    await run(
      rejecting.id,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/matches/${rejecting.id}/reject`, { method: "POST" });
        setRejecting(null);
        await reload();
        return t("bank.undone");
      },
      t("bank.undoFailed"),
    );
  }

  const rangeInvalid = !from || !to || from > to;
  const zipUrl = apiPath(`/organizations/${organizationId}/reports/accountant-export?from=${from}&to=${to}`);
  const suggestions = review?.suggestions ?? [];
  const matched = review?.autoMatched ?? [];

  return (
    <>
      <PageHeader
        title={t("bank.title")}
        description={t("bank.description")}
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <FileSpreadsheetIcon /> {t("bank.importStatement")}
            </Button>
            <Button variant="outline" onClick={() => setUploading(true)}>
              <UploadIcon /> {t("bank.uploadInvoices")}
            </Button>
            <Button disabled={busy !== null} onClick={reconcile}>
              <SparklesIcon /> {busy === "reconcile" ? t("bank.reconciling") : t("bank.reconcile")}
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      <Section
        title={t("bank.review")}
        description={t("bank.reviewHint")}
        actions={
          <Button variant="ghost" size="sm" disabled={loading} onClick={() => void reload()}>
            <RefreshCwIcon /> {t("bank.refresh")}
          </Button>
        }
      >
        <Segmented
          label={t("bank.review")}
          value={tab}
          onChange={setTab}
          options={[
            ["suggestions", t("bank.tabSuggestions"), suggestions.length],
            ["matched", t("bank.tabMatched"), matched.length],
          ]}
        />
        {initialLoading ? (
          <LoadingRows rows={3} />
        ) : review === null ? null : tab === "suggestions" ? (
          suggestions.length === 0 ? (
            <EmptyState
              icon={LandmarkIcon}
              title={t("bank.emptySuggestions")}
              hint={t("bank.emptySuggestionsHint")}
              action={
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <FileSpreadsheetIcon /> {t("bank.importStatement")}
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {suggestions.map((row) => (
                <PairRow
                  key={`${row.transaction.id}-${row.invoice.id}`}
                  row={row}
                  kind="suggestion"
                  action={
                    <Button size="sm" disabled={busy !== null} onClick={() => confirm(row)}>
                      <CheckIcon /> {busy === row.transaction.id ? t("bank.confirming") : t("bank.confirm")}
                    </Button>
                  }
                />
              ))}
            </ul>
          )
        ) : matched.length === 0 ? (
          <EmptyState title={t("bank.emptyMatched")} hint={t("bank.emptyMatchedHint")} />
        ) : (
          <ul className="flex flex-col gap-2">
            {matched.map((row) => (
              <PairRow
                key={row.id}
                row={row}
                kind={row.transaction.matchStatus === "MANUALLY_MATCHED" ? "manual" : "auto"}
                action={
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setRejecting(row)}>
                    <XIcon /> {t("bank.undo")}
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>{t("bank.packTitle")}</CardTitle>
          <CardDescription>{t("bank.packDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field id="zip-from" label={t("common.from")}>
            <Input id="zip-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field id="zip-to" label={t("common.to")} error={from && to && from > to ? t("validation.dateAfter") : null}>
            <Input id="zip-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Button variant="outline" className="sm:mt-6" disabled={rangeInvalid} render={rangeInvalid ? undefined : <a href={zipUrl} />}>
            <DownloadIcon /> {t("bank.downloadZip")}
          </Button>
        </CardContent>
      </Card>

      <UploadDialog
        open={importing}
        onOpenChange={setImporting}
        title={t("bank.importTitle")}
        description={t("bank.importDescription")}
        accept=".csv,.ofx,.qfx,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/x-ofx"
        extensions={[".csv", ".ofx", ".qfx", ".xlsx"]}
        submitLabel={() => t("bank.importSubmit")}
        onUpload={uploadStatement}
      />
      <UploadDialog
        open={uploading}
        onOpenChange={setUploading}
        title={t("bank.uploadTitle")}
        description={t("bank.uploadDescription")}
        accept="application/pdf,image/png,image/jpeg"
        extensions={[".pdf", ".png", ".jpg", ".jpeg"]}
        multiple
        submitLabel={(count) => (count > 1 ? t("bank.uploadMany", { count }) : t("bank.uploadOne"))}
        onUpload={uploadInvoices}
      />
      <FormDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title={t("bank.undoTitle")}
        description={
          rejecting
            ? t("bank.undoDescription", {
                desc: rejecting.transaction.rawDescription,
                amount: euros(rejecting.transaction.amountCents),
              })
            : undefined
        }
        submitLabel={t("bank.undoSubmit")}
        busy={rejecting !== null && busy === rejecting.id}
        destructive
        onSubmit={reject}
      />
    </>
  );
}

function PairRow({ row, kind, action }: { row: Suggestion; kind: MatchKind; action: React.ReactNode }) {
  const t = useT();
  const score = Number(row.confidenceScore);
  const tone = score >= 0.88 ? "success" : score >= 0.75 ? "warning" : "neutral";
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("bank.movement")} · {formatDate(row.transaction.transactionDate)}
          </p>
          <p className="truncate font-medium" title={row.transaction.rawDescription}>
            {row.transaction.rawDescription}
          </p>
          <p className="text-sm tabular-nums">{euros(row.transaction.amountCents)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("bank.invoice")} · {formatDate(row.invoice.invoiceDate)}
          </p>
          <p className="truncate font-medium">{row.invoice.vendorName ?? t("bank.unknownVendor")}</p>
          <p className="text-sm tabular-nums">{euros(row.invoice.totalAmountCents)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-1.5">
            <MatchBadge kind={kind} />
            <StatusBadge tone={tone}>{t("bank.confidence", { score: score.toFixed(2).replace(".", ",") })}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("bank.scoreAmount")} {row.breakdown.amount.score} · {t("bank.scoreDate")} {row.breakdown.date.score} · {t("bank.scoreText")}{" "}
            {row.breakdown.text.score} · {t("bank.scoreTaxId")} {row.breakdown.vendor.score}
          </p>
        </div>
        {action}
      </div>
    </li>
  );
}
