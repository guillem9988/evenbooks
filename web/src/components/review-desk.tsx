"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BanIcon,
  CheckCheckIcon,
  CheckIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  LandmarkIcon,
  Link2Icon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  Undo2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  currency: string;
  rawDescription: string;
  matchStatus?: string;
}

interface InvoiceLine {
  id: string;
  vendorName: string | null;
  vendorTaxId?: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  totalAmountCents: string | null;
  currency?: string | null;
  isIssued?: boolean;
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

interface StatsPayload {
  total: number;
  matched: number;
  suggestions: number;
  unmatched: number;
  ignored: number;
  completionPercent: number;
}

interface ReviewPayload {
  suggestions: Suggestion[];
  autoMatched: AutoMatch[];
  matched?: AutoMatch[];
  unmatched?: BankLine[];
  ignored?: BankLine[];
  stats?: StatsPayload;
}

interface CandidateInvoice extends InvoiceLine {
  exactAmount: boolean;
  score: number | null;
}

interface AiMatchResult {
  transactionId: string;
  invoiceId: string;
  isIssued?: boolean;
  confidenceScore: string;
  reason: string;
  transaction: BankLine;
  invoice: InvoiceLine;
}

interface AiClassificationResult {
  transactionId: string;
  suggestedType: "BANK_FEE" | "TAX" | "PAYROLL" | "SOCIAL_SECURITY" | "OTHER";
  reason: string;
  transaction: BankLine;
}

interface AiAnalyzePayload {
  matches: AiMatchResult[];
  classifications: AiClassificationResult[];
}

type Tab = "suggestions" | "unmatched" | "matched" | "ignored";

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
  const [assigningTx, setAssigningTx] = useState<BankLine | null>(null);
  const [aiResults, setAiResults] = useState<AiAnalyzePayload | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);

  const load = useCallback(async (): Promise<ReviewPayload> => {
    const body = await api<ReviewPayload>(`/organizations/${organizationId}/reconciliation/review`);
    return {
      suggestions: body.suggestions ?? [],
      autoMatched: body.autoMatched ?? [],
      matched: body.matched ?? body.autoMatched ?? [],
      unmatched: body.unmatched ?? [],
      ignored: body.ignored ?? [],
      stats: body.stats,
    };
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
    const body = await api<{ totalTransactions: number }>(`/organizations/${organizationId}/statements`, {
      method: "POST",
      body: form,
    });
    notifySuccess(t("bank.imported", { count: body.totalTransactions }));
    await reload();
  }

  async function uploadInvoices(files: File[]) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const body = await api<{ invoiceIds: string[] }>(`/organizations/${organizationId}/invoices`, {
      method: "POST",
      body: form,
    });
    notifySuccess(
      body.invoiceIds.length === 1
        ? t("bank.queuedOne")
        : t("bank.queuedMany", { count: body.invoiceIds.length }),
    );
  }

  const reconcile = () =>
    run(
      "reconcile",
      async () => {
        const body = await api<{ confirmed: unknown[]; suggestions: unknown[] }>(
          `/organizations/${organizationId}/reconcile`,
          { method: "POST" },
        );
        await reload();
        return t("bank.reconcileDone", {
          auto: body.confirmed.length,
          suggestions: body.suggestions.length,
        });
      },
      t("bank.reconcileFailed"),
    );

  const batchConfirm = () =>
    run(
      "batch-confirm",
      async () => {
        const body = await api<{ confirmedCount: number }>(
          `/organizations/${organizationId}/reconciliation/batch-confirm`,
          { method: "POST" },
        );
        await reload();
        return t("bank.batchConfirmSuccess", { count: body.confirmedCount });
      },
      t("bank.batchConfirmFailed"),
    );

  const confirm = (row: Suggestion) =>
    run(
      row.transaction.id,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/matches`, {
          method: "POST",
          body: JSON.stringify({
            transactionId: row.transaction.id,
            invoiceId: row.invoice.id,
            isIssued: row.invoice.isIssued,
          }),
        });
        await reload();
        return t("bank.confirmed");
      },
      t("bank.confirmFailed"),
    );

  const ignoreTx = (tx: BankLine) =>
    run(
      `ignore-${tx.id}`,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/transactions/${tx.id}/ignore`, {
          method: "POST",
        });
        await reload();
        return t("bank.markNoInvoiceSuccess");
      },
      t("bank.reconcileFailed"),
    );

  const unignoreTx = (tx: BankLine) =>
    run(
      `unignore-${tx.id}`,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/transactions/${tx.id}/unignore`, {
          method: "POST",
        });
        await reload();
        return t("bank.restoreSuccess");
      },
      t("bank.reconcileFailed"),
    );

  const handleAiAnalyze = async () => {
    setAiAnalyzing(true);
    try {
      const res = await api<AiAnalyzePayload>(
        `/organizations/${organizationId}/reconciliation/ai-analyze`,
        { method: "POST" },
      );
      setAiResults(res);
      if ((res.matches?.length ?? 0) === 0 && (res.classifications?.length ?? 0) === 0) {
        notifySuccess(t("bank.aiBannerEmpty"));
      } else {
        notifySuccess(
          t("bank.aiBannerDescription", {
            matches: res.matches?.length ?? 0,
            classifications: res.classifications?.length ?? 0,
          }),
        );
      }
    } catch (err) {
      notifyError(err, t("bank.reconcileFailed"));
    } finally {
      setAiAnalyzing(false);
    }
  };

  const acceptAiMatch = async (match: AiMatchResult) => {
    await run(
      `ai-match-${match.transactionId}`,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/matches`, {
          method: "POST",
          body: JSON.stringify({
            transactionId: match.transactionId,
            invoiceId: match.invoiceId,
            isIssued: match.isIssued ?? match.invoice.isIssued,
          }),
        });
        setAiResults((prev) =>
          prev
            ? {
                ...prev,
                matches: prev.matches.filter((m) => m.transactionId !== match.transactionId),
              }
            : null,
        );
        await reload();
        return t("bank.confirmed");
      },
      t("bank.confirmFailed"),
    );
  };

  const acceptAllAiMatches = async () => {
    if (!aiResults || aiResults.matches.length === 0) return;
    await run(
      "accept-all-ai",
      async () => {
        let count = 0;
        for (const m of aiResults.matches) {
          try {
            await api(`/organizations/${organizationId}/reconciliation/matches`, {
              method: "POST",
              body: JSON.stringify({
                transactionId: m.transactionId,
                invoiceId: m.invoiceId,
                isIssued: m.isIssued ?? m.invoice.isIssued,
              }),
            });
            count++;
          } catch {
            // continue
          }
        }
        setAiResults((prev) => (prev ? { ...prev, matches: [] } : null));
        await reload();
        return t("bank.batchConfirmSuccess", { count });
      },
      t("bank.batchConfirmFailed"),
    );
  };

  const acceptAiClassification = async (c: AiClassificationResult) => {
    await run(
      `ai-class-${c.transactionId}`,
      async () => {
        await api(
          `/organizations/${organizationId}/reconciliation/transactions/${c.transactionId}/ignore`,
          { method: "POST" },
        );
        setAiResults((prev) =>
          prev
            ? {
                ...prev,
                classifications: prev.classifications.filter(
                  (item) => item.transactionId !== c.transactionId,
                ),
              }
            : null,
        );
        await reload();
        return t("bank.markNoInvoiceSuccess");
      },
      t("bank.reconcileFailed"),
    );
  };

  async function reject() {
    if (rejecting === null) return;
    await run(
      rejecting.id,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/matches/${rejecting.id}/reject`, {
          method: "POST",
        });
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
  const matched = review?.matched ?? review?.autoMatched ?? [];
  const unmatched = review?.unmatched ?? [];
  const ignored = review?.ignored ?? [];
  const stats = review?.stats;

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
            <Button
              disabled={busy !== null || aiAnalyzing}
              onClick={handleAiAnalyze}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-sm"
            >
              <SparklesIcon className={aiAnalyzing ? "animate-spin" : ""} />
              {aiAnalyzing ? t("bank.aiAnalyzing") : t("bank.aiAnalyze")}
            </Button>
            <Button disabled={busy !== null} onClick={reconcile}>
              {busy === "reconcile" ? t("bank.reconciling") : t("bank.reconcile")}
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {/* AI Analysis Results Card */}
      {aiResults !== null && (aiResults.matches.length > 0 || aiResults.classifications.length > 0) && (
        <Card className="border-violet-300 bg-violet-50/50 dark:bg-violet-950/20 dark:border-violet-900 overflow-hidden mb-4">
          <CardHeader className="pb-3 border-b border-violet-200/60 dark:border-violet-900/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white">
                  <SparklesIcon className="h-4 w-4" />
                </span>
                <div>
                  <CardTitle className="text-base text-violet-950 dark:text-violet-100">
                    {t("bank.aiBannerTitle")}
                  </CardTitle>
                  <CardDescription className="text-xs text-violet-700 dark:text-violet-300">
                    {t("bank.aiBannerDescription", {
                      matches: aiResults.matches.length,
                      classifications: aiResults.classifications.length,
                    })}
                  </CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setAiResults(null)}>
                <XIcon className="h-4 w-4" /> {t("bank.aiDismiss")}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col gap-4">
            {aiResults.matches.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-violet-900 dark:text-violet-300">
                    {t("bank.aiMatchBadge")} ({aiResults.matches.length})
                  </p>
                  {aiResults.matches.length > 1 && (
                    <Button
                      size="sm"
                      onClick={acceptAllAiMatches}
                      className="bg-violet-600 hover:bg-violet-700 text-white text-xs h-7"
                    >
                      <CheckCheckIcon className="h-3.5 w-3.5 mr-1" />
                      {t("bank.aiAcceptAllMatches", { count: aiResults.matches.length })}
                    </Button>
                  )}
                </div>
                <ul className="flex flex-col gap-2">
                  {aiResults.matches.map((match) => (
                    <li
                      key={`${match.transactionId}-${match.invoiceId}`}
                      className="flex flex-col gap-2 rounded-lg border border-violet-200 bg-white p-3 dark:bg-card dark:border-violet-900"
                    >
                      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground uppercase">
                            {t("bank.movement")} · {formatDate(match.transaction.transactionDate)}
                          </p>
                          <p className="truncate font-medium">{match.transaction.rawDescription}</p>
                          <p className="text-sm font-semibold tabular-nums">
                            {euros(match.transaction.amountCents)}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs text-muted-foreground uppercase">
                              {match.invoice.isIssued ? t("bank.issuedInvoiceBadge") : t("bank.invoice")} · {formatDate(match.invoice.invoiceDate)}
                            </p>
                            {match.invoice.isIssued && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {t("bank.clientPaymentBadge")}
                              </span>
                            )}
                          </div>
                          <p className="truncate font-medium">
                            {match.invoice.vendorName ?? t("bank.unknownVendor")}
                          </p>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold tabular-nums">
                              {euros(match.invoice.totalAmountCents)}
                            </p>
                            {match.invoice.invoiceNumber && (
                              <span className="text-xs text-muted-foreground font-mono">({match.invoice.invoiceNumber})</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t border-violet-100 dark:border-violet-900">
                        <p className="text-xs text-violet-800 dark:text-violet-300 font-medium flex-1">
                          💡 {match.reason}
                        </p>
                        <Button
                          size="sm"
                          onClick={() => acceptAiMatch(match)}
                          className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                        >
                          <CheckIcon className="h-3.5 w-3.5 mr-1" /> {t("bank.aiAcceptMatch")}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {aiResults.classifications.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  {t("bank.aiClassificationBadge")} ({aiResults.classifications.length})
                </p>
                <ul className="flex flex-col gap-2">
                  {aiResults.classifications.map((c) => (
                    <li
                      key={c.transactionId}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-3 dark:bg-card dark:border-amber-900"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground uppercase">
                          {t("bank.movement")} · {formatDate(c.transaction.transactionDate)}
                        </p>
                        <p className="truncate font-medium">{c.transaction.rawDescription}</p>
                        <p className="text-sm font-semibold tabular-nums">
                          {euros(c.transaction.amountCents)}
                        </p>
                        <p className="text-xs text-amber-800 dark:text-amber-300 font-medium mt-0.5">
                          💡 {c.reason}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => acceptAiClassification(c)}
                        className="border-amber-300 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950 shrink-0"
                      >
                        <BanIcon className="h-3.5 w-3.5 mr-1" /> {t("bank.aiAcceptClassification")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPI Stats Overview */}
      {stats !== undefined && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">{t("bank.statsTotal")}</p>
            <p className="text-2xl font-bold">{stats.total}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase">{t("bank.statsMatched")}</p>
              <StatusBadge tone="success">{stats.completionPercent}%</StatusBadge>
            </div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.matched}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">{t("bank.statsSuggestions")}</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.suggestions}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground uppercase">{t("bank.statsUnmatched")}</p>
            <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{stats.unmatched}</p>
          </Card>
        </div>
      )}

      <Section
        title={t("bank.review")}
        description={t("bank.reviewHint")}
        actions={
          <div className="flex items-center gap-2">
            {tab === "suggestions" && suggestions.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={batchConfirm}
                className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-950/40"
              >
                <CheckCheckIcon />
                {busy === "batch-confirm"
                  ? t("bank.batchConfirming")
                  : t("bank.batchConfirm", { count: suggestions.length })}
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={loading} onClick={() => void reload()}>
              <RefreshCwIcon /> {t("bank.refresh")}
            </Button>
          </div>
        }
      >
        <Segmented
          label={t("bank.review")}
          value={tab}
          onChange={setTab}
          options={[
            ["suggestions", t("bank.tabSuggestions"), suggestions.length],
            ["unmatched", t("bank.tabUnmatched"), unmatched.length],
            ["matched", t("bank.tabMatched"), matched.length],
            ["ignored", t("bank.tabIgnored"), ignored.length],
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
        ) : tab === "unmatched" ? (
          unmatched.length === 0 ? (
            <EmptyState
              icon={CheckIcon}
              title={t("bank.emptyUnmatched")}
              hint={t("bank.emptyUnmatchedHint")}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {unmatched.map((tx) => (
                <UnmatchedTxRow
                  key={tx.id}
                  transaction={tx}
                  busy={busy}
                  onAssign={() => setAssigningTx(tx)}
                  onIgnore={() => ignoreTx(tx)}
                />
              ))}
            </ul>
          )
        ) : tab === "matched" ? (
          matched.length === 0 ? (
            <EmptyState title={t("bank.emptyMatched")} hint={t("bank.emptyMatchedHint")} />
          ) : (
            <ul className="flex flex-col gap-2">
              {matched.map((row) => (
                <PairRow
                  key={row.id}
                  row={row}
                  kind={row.transaction.matchStatus === "MANUALLY_MATCHED" ? "manual" : "auto"}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => setRejecting(row)}
                    >
                      <XIcon /> {t("bank.undo")}
                    </Button>
                  }
                />
              ))}
            </ul>
          )
        ) : ignored.length === 0 ? (
          <EmptyState
            icon={BanIcon}
            title={t("bank.emptyIgnored")}
            hint={t("bank.emptyIgnoredHint")}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {ignored.map((tx) => (
              <IgnoredTxRow
                key={tx.id}
                transaction={tx}
                busy={busy}
                onRestore={() => unignoreTx(tx)}
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
          <Button
            variant="outline"
            className="sm:mt-6"
            disabled={rangeInvalid}
            render={rangeInvalid ? undefined : <a href={zipUrl} />}
          >
            <DownloadIcon /> {t("bank.downloadZip")}
          </Button>
        </CardContent>
      </Card>

      <UploadDialog
        open={importing}
        onOpenChange={setImporting}
        title={t("bank.importTitle")}
        description={t("bank.importDescription")}
        accept=".csv,.xlsx,.xls,.ofx,.qfx,.n43,.c43,.txt,.pdf,text/csv,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/x-ofx"
        extensions={[".n43", ".c43", ".csv", ".xlsx", ".xls", ".ofx", ".qfx", ".txt", ".pdf"]}
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

      {assigningTx !== null && (
        <AssignInvoiceDialog
          open={assigningTx !== null}
          onOpenChange={(open) => !open && setAssigningTx(null)}
          transaction={assigningTx}
          organizationId={organizationId}
          onAssigned={async () => {
            setAssigningTx(null);
            await reload();
          }}
        />
      )}
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
          <p className="text-sm tabular-nums font-semibold">{euros(row.transaction.amountCents)}</p>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              {row.invoice.isIssued ? t("bank.issuedInvoiceBadge") : t("bank.invoice")} · {formatDate(row.invoice.invoiceDate)}
            </p>
            {row.invoice.isIssued && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                {t("bank.clientPaymentBadge")}
              </span>
            )}
          </div>
          <p className="truncate font-medium">{row.invoice.vendorName ?? t("bank.unknownVendor")}</p>
          <div className="flex items-center gap-2">
            <p className="text-sm tabular-nums">{euros(row.invoice.totalAmountCents)}</p>
            {row.invoice.invoiceNumber && (
              <span className="text-xs text-muted-foreground font-mono">({row.invoice.invoiceNumber})</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-1.5">
            <MatchBadge kind={kind} />
            <StatusBadge tone={tone}>{t("bank.confidence", { score: score.toFixed(2).replace(".", ",") })}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("bank.scoreAmount")} {row.breakdown.amount.score} · {t("bank.scoreDate")} {row.breakdown.date.score} ·{" "}
            {t("bank.scoreText")} {row.breakdown.text.score} · {t("bank.scoreTaxId")} {row.breakdown.vendor.score}
          </p>
        </div>
        {action}
      </div>
    </li>
  );
}

function UnmatchedTxRow({
  transaction,
  busy,
  onAssign,
  onIgnore,
}: {
  transaction: BankLine;
  busy: string | null;
  onAssign: () => void;
  onIgnore: () => void;
}) {
  const t = useT();
  const isCredit = BigInt(transaction.amountCents) > 0n;

  return (
    <li className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between hover:border-foreground/20 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("bank.movement")} · {formatDate(transaction.transactionDate)}
          </p>
          {isCredit ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Ingrés
            </span>
          ) : (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Càrrec
            </span>
          )}
        </div>
        <p className="truncate font-medium text-base mt-0.5" title={transaction.rawDescription}>
          {transaction.rawDescription}
        </p>
        <p className={`text-sm tabular-nums font-semibold mt-0.5 ${isCredit ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
          {euros(transaction.amountCents)}
        </p>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        <Button size="sm" onClick={onAssign}>
          <Link2Icon /> {t("bank.assignInvoice")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy === `ignore-${transaction.id}`}
          onClick={onIgnore}
          title={t("bank.markNoInvoice")}
        >
          <BanIcon /> {t("bank.noInvoice")}
        </Button>
      </div>
    </li>
  );
}

function IgnoredTxRow({
  transaction,
  busy,
  onRestore,
}: {
  transaction: BankLine;
  busy: string | null;
  onRestore: () => void;
}) {
  const t = useT();
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-dashed p-3 sm:flex-row sm:items-center sm:justify-between opacity-80 hover:opacity-100 transition-opacity">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("bank.movement")} · {formatDate(transaction.transactionDate)}
          </p>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {t("bank.noInvoice")}
          </span>
        </div>
        <p className="truncate font-medium mt-0.5" title={transaction.rawDescription}>
          {transaction.rawDescription}
        </p>
        <p className="text-sm tabular-nums font-semibold mt-0.5">{euros(transaction.amountCents)}</p>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        <Button
          size="sm"
          variant="outline"
          disabled={busy === `unignore-${transaction.id}`}
          onClick={onRestore}
        >
          <Undo2Icon /> {t("bank.restore")}
        </Button>
      </div>
    </li>
  );
}

function AssignInvoiceDialog({
  open,
  onOpenChange,
  transaction,
  organizationId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: BankLine;
  organizationId: string;
  onAssigned: () => void;
}) {
  const t = useT();
  const isCredit = BigInt(transaction.amountCents) > 0n;
  const [tabType, setTabType] = useState<"issued" | "expense">(isCredit ? "issued" : "expense");
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<CandidateInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTabType(BigInt(transaction.amountCents) > 0n ? "issued" : "expense");
      setSearch("");
    }
  }, [open, transaction.id, transaction.amountCents]);

  const fetchCandidates = useCallback(
    async (searchTerm: string, type: "issued" | "expense") => {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          transactionId: transaction.id,
          search: searchTerm,
          type,
        });
        const res = await api<{ candidates: CandidateInvoice[] }>(
          `/organizations/${organizationId}/reconciliation/candidate-invoices?${query.toString()}`,
        );
        setCandidates(res.candidates ?? []);
      } catch (err) {
        notifyError(err, t("bank.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [organizationId, transaction.id, t],
  );

  useEffect(() => {
    if (open) {
      void fetchCandidates(search, tabType);
    }
  }, [open, search, tabType, fetchCandidates]);

  async function handleAssign(inv: CandidateInvoice) {
    setBusyId(inv.id);
    try {
      await api(`/organizations/${organizationId}/reconciliation/matches`, {
        method: "POST",
        body: JSON.stringify({
          transactionId: transaction.id,
          invoiceId: inv.id,
          isIssued: inv.isIssued ?? (tabType === "issued"),
        }),
      });
      notifySuccess(t("bank.assignSuccess"));
      onAssigned();
    } catch (err) {
      notifyError(err, t("bank.assignFailed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isCredit ? t("bank.assignClientTitle") : t("bank.assignTitle")}
          </DialogTitle>
          <DialogDescription>
            {isCredit
              ? t("bank.assignClientDescription", {
                  amount: euros(transaction.amountCents),
                  date: formatDate(transaction.transactionDate),
                })
              : t("bank.assignDescription", {
                  amount: euros(transaction.amountCents),
                  date: formatDate(transaction.transactionDate),
                })}
          </DialogDescription>
        </DialogHeader>

        {/* Selected movement summary */}
        <div className="rounded-lg bg-muted/60 p-2.5 text-xs flex flex-col gap-1 border">
          <div className="flex justify-between font-semibold">
            <span className="text-muted-foreground">{formatDate(transaction.transactionDate)}</span>
            <span className={`tabular-nums text-sm font-bold ${isCredit ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
              {euros(transaction.amountCents)}
            </span>
          </div>
          <p className="truncate text-foreground font-mono">{transaction.rawDescription}</p>
        </div>

        {/* Tabs to switch between issued sales and supplier expenses */}
        <div className="flex border-b text-xs font-medium">
          <button
            type="button"
            className={`px-3 py-1.5 border-b-2 transition-colors ${
              tabType === "issued"
                ? "border-emerald-600 text-emerald-600 dark:text-emerald-400 font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTabType("issued")}
          >
            {t("bank.tabIssuedInvoices")}
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 border-b-2 transition-colors ${
              tabType === "expense"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTabType("expense")}
          >
            {t("bank.tabExpenseInvoices")}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              tabType === "issued"
                ? t("bank.assignClientSearchPlaceholder")
                : t("bank.assignSearchPlaceholder")
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* Invoices List */}
        <div className="overflow-y-auto flex-1 flex flex-col gap-2 min-h-[220px] max-h-[380px] pr-1">
          {loading ? (
            <LoadingRows rows={3} />
          ) : candidates.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">{t("bank.noCandidates")}</p>
          ) : (
            candidates.map((inv) => (
              <div
                key={inv.id}
                className={`flex items-center justify-between gap-3 p-3 rounded-lg border transition-all ${
                  inv.exactAmount
                    ? "border-emerald-500/50 bg-emerald-50/40 dark:bg-emerald-950/20"
                    : "hover:bg-muted/40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm truncate">{inv.vendorName ?? t("bank.unknownVendor")}</p>
                    {inv.isIssued && (
                      <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                        {t("bank.issuedInvoiceBadge")}
                      </span>
                    )}
                    {inv.exactAmount && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        {t("bank.assignExactBadge")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {inv.invoiceNumber && <span>{inv.isIssued ? "Sèrie" : "Fra"}: {inv.invoiceNumber}</span>}
                    {inv.invoiceDate && <span>· {formatDate(inv.invoiceDate)}</span>}
                    {inv.vendorTaxId && <span>· {inv.vendorTaxId}</span>}
                  </div>
                  <p className="text-sm font-semibold tabular-nums mt-1">{euros(inv.totalAmountCents)}</p>
                </div>

                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => handleAssign(inv)}
                  className={
                    inv.exactAmount
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600"
                      : ""
                  }
                >
                  <CheckIcon />
                  {busyId === inv.id ? "…" : t("bank.assignSubmit")}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
