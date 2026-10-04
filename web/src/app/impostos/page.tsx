"use client";

import { useCallback } from "react";
import { InfoIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationId } from "@/components/shell";
import { CardsSkeleton, EmptyState, ErrorBanner, KpiCard, PageHeader, QuarterPicker, formatDate, quarterRange, useLoad, useQuarter } from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Bucket {
  rate: number;
  baseCents: string;
  taxCents: string;
}

interface Preview {
  issued: Bucket[];
  received: Bucket[];
}

interface Modelo130 {
  incomeCents: string;
  expenseCents: string;
  netCents: string;
  paymentCents: string;
  /** Present for a calendar quarter: the year-to-date figures the AEAT form uses. Older APIs omit it. */
  cumulative?: {
    to: string;
    incomeCents: string;
    expenseCents: string;
    netCents: string;
    grossPaymentCents: string;
    previousPaymentsCents: string;
    paymentCents: string;
  } | null;
}

export default function TaxesPage() {
  const t = useT();
  const organizationId = useOrganizationId();
  const [quarter, setQuarter] = useQuarter();
  const { from, to } = quarterRange(quarter);

  const load = useCallback(async () => {
    const [model303, model130] = await Promise.all([
      api<Preview>(`/organizations/${organizationId}/taxes/preview?from=${from}&to=${to}`),
      api<Modelo130>(`/organizations/${organizationId}/taxes/130?from=${from}&to=${to}`),
    ]);
    return { model303, model130 };
  }, [organizationId, from, to]);

  const { data, error, loading, reload } = useLoad(load, t("taxes.loadFailed"));

  const output = sumTax(data?.model303.issued ?? []);
  const input = sumTax(data?.model303.received ?? []);
  const balance = output - input;

  return (
    <>
      <PageHeader title={t("taxes.title")} description={t("taxes.description")} actions={<QuarterPicker value={quarter} onChange={setQuarter} />} />
      <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("taxes.disclaimer")}
      </p>
      <ErrorBanner message={error} onRetry={reload} />
      {loading ? (
        <>
          <CardsSkeleton count={3} className="lg:grid-cols-3" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        </>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              label={balance < 0n ? t("taxes.model303credit") : t("taxes.model303due")}
              value={euros((balance < 0n ? -balance : balance).toString())}
              hint={t("taxes.model303hint")}
            />
            {data.model130.cumulative ? (
              <KpiCard label={t("taxes.model130")} value={euros(data.model130.cumulative.paymentCents)} hint={t("taxes.model130cumulativeHint")} />
            ) : (
              <KpiCard label={t("taxes.model130")} value={euros(data.model130.paymentCents)} hint={t("taxes.model130hint")} />
            )}
            <KpiCard
              label={t("taxes.net")}
              value={euros(data.model130.netCents)}
              hint={t("taxes.netHint", { income: euros(data.model130.incomeCents), expenses: euros(data.model130.expenseCents) })}
              tone={data.model130.netCents.startsWith("-") ? "negative" : undefined}
            />
          </div>
          {data.model130.cumulative ? <Breakdown130 cumulative={data.model130.cumulative} quarterNet={data.model130.netCents} /> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <RateCard title={t("taxes.outputVat")} description={t("taxes.outputVatHint")} rows={data.model303.issued} />
            <RateCard title={t("taxes.inputVat")} description={t("taxes.inputVatHint")} rows={data.model303.received} />
          </div>
        </>
      ) : null}
    </>
  );
}

function Breakdown130({ cumulative, quarterNet }: { cumulative: NonNullable<Modelo130["cumulative"]>; quarterNet: string }) {
  const t = useT();
  const rows: Array<[string, string, string, boolean?]> = [
    ["01", t("taxes.box01"), cumulative.incomeCents],
    ["02", t("taxes.box02"), cumulative.expenseCents],
    ["03", t("taxes.box03"), cumulative.netCents],
    ["04", t("taxes.box04"), cumulative.grossPaymentCents],
    ["05", t("taxes.box05"), cumulative.previousPaymentsCents],
    ["07", t("taxes.box07"), cumulative.paymentCents, true],
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("taxes.breakdownTitle")}</CardTitle>
        <CardDescription>{t("taxes.breakdownHint", { to: formatDate(cumulative.to) })}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="divide-y rounded-lg border">
          {rows.map(([box, label, value, total]) => (
            <div key={box} className={cn("flex items-center gap-3 px-3 py-2 text-sm", total && "bg-muted/50 font-semibold")}>
              <dt className="flex flex-1 items-center gap-2.5">
                <span className="w-7 shrink-0 rounded bg-muted px-1 py-0.5 text-center font-mono text-[11px] text-muted-foreground">{box}</span>
                {label}
              </dt>
              <dd className="tabular-nums">{euros(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          {t("taxes.quarterOnly", { net: euros(quarterNet) })} · {t("taxes.breakdownNote")}
        </p>
      </CardContent>
    </Card>
  );
}

function RateCard({ title, description, rows }: { title: string; description: string; rows: Bucket[] }) {
  const t = useT();
  const base = rows.reduce((total, row) => total + BigInt(row.baseCents), 0n);
  const tax = sumTax(rows);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title={t("taxes.emptyQuarter")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("taxes.rate")}</TableHead>
                <TableHead className="text-right">{t("common.base")}</TableHead>
                <TableHead className="text-right">{t("taxes.quota")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.rate}>
                  <TableCell>{row.rate}%</TableCell>
                  <TableCell className="text-right tabular-nums">{euros(row.baseCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{euros(row.taxCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>{t("common.total")}</TableCell>
                <TableCell className="text-right tabular-nums">{euros(base)}</TableCell>
                <TableCell className="text-right tabular-nums">{euros(tax)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function sumTax(rows: Bucket[]): bigint {
  return rows.reduce((total, row) => total + BigInt(row.taxCents), 0n);
}
