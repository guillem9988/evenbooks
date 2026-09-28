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

  const { data: review, error, initialLoading, loading, reload } = useLoad(load, "No s’ha pogut carregar la revisió");

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
    notifySuccess(`Extracte importat: ${body.totalTransactions} moviments. Ara pots conciliar.`);
    await reload();
  }

  async function uploadInvoices(files: File[]) {
    const form = new FormData();
    for (const file of files) form.append("files", file);
    const body = await api<{ invoiceIds: string[] }>(`/organizations/${organizationId}/invoices`, { method: "POST", body: form });
    notifySuccess(`${body.invoiceIds.length} ${body.invoiceIds.length === 1 ? "factura a la cua" : "factures a la cua"} d’anàlisi. Apareixeran a Despeses.`);
  }

  const reconcile = () =>
    run(
      "reconcile",
      async () => {
        const body = await api<{ confirmed: unknown[]; suggestions: unknown[] }>(`/organizations/${organizationId}/reconcile`, { method: "POST" });
        await reload();
        return `Conciliació feta: ${body.confirmed.length} automàtiques i ${body.suggestions.length} suggeriments per revisar.`;
      },
      "No s’ha pogut conciliar",
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
        return "Suggeriment confirmat.";
      },
      "No s’ha pogut confirmar",
    );

  async function reject() {
    if (rejecting === null) return;
    await run(
      rejecting.id,
      async () => {
        await api(`/organizations/${organizationId}/reconciliation/matches/${rejecting.id}/reject`, { method: "POST" });
        setRejecting(null);
        await reload();
        return "Conciliació desfeta. El moviment torna a estar pendent.";
      },
      "No s’ha pogut desfer",
    );
  }

  const rangeInvalid = !from || !to || from > to;
  const zipUrl = apiPath(`/organizations/${organizationId}/reports/accountant-export?from=${from}&to=${to}`);
  const suggestions = review?.suggestions ?? [];
  const matched = review?.autoMatched ?? [];

  return (
    <>
      <PageHeader
        title="Banc"
        description="Importa l’extracte i les factures, concilia i revisa el que el sistema no ha pogut confirmar sol."
        actions={
          <>
            <Button variant="outline" onClick={() => setImporting(true)}>
              <FileSpreadsheetIcon /> Importa l’extracte
            </Button>
            <Button variant="outline" onClick={() => setUploading(true)}>
              <UploadIcon /> Puja factures
            </Button>
            <Button disabled={busy !== null} onClick={reconcile}>
              <SparklesIcon /> {busy === "reconcile" ? "Conciliant…" : "Concilia ara"}
            </Button>
          </>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      <Section
        title="Revisió"
        description="Suggeriments amb confiança entre 0,65 i 0,88, i les conciliacions automàtiques per si cal desfer-ne alguna."
        actions={
          <Button variant="ghost" size="sm" disabled={loading} onClick={() => void reload()}>
            <RefreshCwIcon /> Actualitza
          </Button>
        }
      >
        <Segmented
          label="Tipus de conciliació"
          value={tab}
          onChange={setTab}
          options={[
            ["suggestions", "Per revisar", suggestions.length],
            ["matched", "Conciliades", matched.length],
          ]}
        />
        {initialLoading ? (
          <LoadingRows rows={3} />
        ) : review === null ? null : tab === "suggestions" ? (
          suggestions.length === 0 ? (
            <EmptyState
              icon={LandmarkIcon}
              title="No hi ha suggeriments pendents"
              hint="Importa un extracte i puja factures; després prem Concilia ara."
              action={
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <FileSpreadsheetIcon /> Importa l’extracte
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
                      <CheckIcon /> {busy === row.transaction.id ? "Confirmant…" : "Confirma"}
                    </Button>
                  }
                />
              ))}
            </ul>
          )
        ) : matched.length === 0 ? (
          <EmptyState title="Encara no hi ha conciliacions automàtiques" hint="Quan la confiança supera 0,88 es concilien soles i apareixen aquí." />
        ) : (
          <ul className="flex flex-col gap-2">
            {matched.map((row) => (
              <PairRow
                key={row.id}
                row={row}
                kind={row.transaction.matchStatus === "MANUALLY_MATCHED" ? "manual" : "auto"}
                action={
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setRejecting(row)}>
                    <XIcon /> Desfés
                  </Button>
                }
              />
            ))}
          </ul>
        )}
      </Section>

      <Card>
        <CardHeader>
          <CardTitle>Paquet per a la gestoria</CardTitle>
          <CardDescription>ZIP amb el resum de moviments, les factures reanomenades i les despeses sense justificant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field id="zip-from" label="Des de">
            <Input id="zip-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field id="zip-to" label="Fins a" error={from && to && from > to ? "Ha de ser posterior a la data d’inici." : null}>
            <Input id="zip-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Button variant="outline" className="sm:mt-6" disabled={rangeInvalid} render={rangeInvalid ? undefined : <a href={zipUrl} />}>
            <DownloadIcon /> Descarrega el ZIP
          </Button>
        </CardContent>
      </Card>

      <UploadDialog
        open={importing}
        onOpenChange={setImporting}
        title="Importa l’extracte bancari"
        description="CSV, OFX, QFX o Excel (.xlsx) exportat del teu banc."
        accept=".csv,.ofx,.qfx,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/x-ofx"
        extensions={[".csv", ".ofx", ".qfx", ".xlsx"]}
        submitLabel={() => "Importa l’extracte"}
        onUpload={uploadStatement}
      />
      <UploadDialog
        open={uploading}
        onOpenChange={setUploading}
        title="Puja factures rebudes"
        description="PDF, PNG o JPG. Se n’extreuen els imports automàticament."
        accept="application/pdf,image/png,image/jpeg"
        extensions={[".pdf", ".png", ".jpg", ".jpeg"]}
        multiple
        submitLabel={(count) => (count > 1 ? `Puja ${count} factures` : "Puja la factura")}
        onUpload={uploadInvoices}
      />
      <FormDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title="Vols desfer aquesta conciliació?"
        description={
          rejecting
            ? `El moviment «${rejecting.transaction.rawDescription}» de ${euros(rejecting.transaction.amountCents)} tornarà a estar pendent.`
            : undefined
        }
        submitLabel="Desfés la conciliació"
        busy={rejecting !== null && busy === rejecting.id}
        destructive
        onSubmit={reject}
      />
    </>
  );
}

function PairRow({ row, kind, action }: { row: Suggestion; kind: MatchKind; action: React.ReactNode }) {
  const score = Number(row.confidenceScore);
  const tone = score >= 0.88 ? "success" : score >= 0.75 ? "warning" : "neutral";
  return (
    <li className="flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Moviment · {formatDate(row.transaction.transactionDate)}</p>
          <p className="truncate font-medium" title={row.transaction.rawDescription}>
            {row.transaction.rawDescription}
          </p>
          <p className="text-sm tabular-nums">{euros(row.transaction.amountCents)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Factura · {formatDate(row.invoice.invoiceDate)}</p>
          <p className="truncate font-medium">{row.invoice.vendorName ?? "Proveïdor desconegut"}</p>
          <p className="text-sm tabular-nums">{euros(row.invoice.totalAmountCents)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end">
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex items-center gap-1.5">
            <MatchBadge kind={kind} />
            <StatusBadge tone={tone}>Confiança {score.toFixed(2).replace(".", ",")}</StatusBadge>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            import {row.breakdown.amount.score} · data {row.breakdown.date.score} · text {row.breakdown.text.score} · NIF {row.breakdown.vendor.score}
          </p>
        </div>
        {action}
      </div>
    </li>
  );
}
