"use client";

import { BellRingIcon, CheckCircle2Icon } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { daysSince, formatDate, sumCents } from "@/components/ui-kit";
import { useT } from "@/i18n";
import { euros } from "@/lib/money";

export interface UnpaidInvoice {
  id: string;
  seriesNumber: string;
  invoiceDate: string;
  contactName: string;
  totalAmountCents: string;
}

/** One hue, light to dark: the older the debt, the darker the segment. Each bucket is also labelled in text. */
const BUCKETS = [
  { key: "aging0", min: 0, max: 30, color: "oklch(0.82 0.1 50)" },
  { key: "aging30", min: 31, max: 60, color: "oklch(0.71 0.14 45)" },
  { key: "aging60", min: 61, max: 90, color: "oklch(0.6 0.16 38)" },
  { key: "aging90", min: 91, max: Number.POSITIVE_INFINITY, color: "oklch(0.48 0.15 30)" },
] as const;

export function AgingCard({ unpaid }: { unpaid: UnpaidInvoice[] }) {
  const t = useT();
  const total = sumCents(unpaid.map((invoice) => invoice.totalAmountCents));
  const totalNumber = Number(total);
  const overdue = unpaid.filter((invoice) => daysSince(invoice.invoiceDate) > 30);
  const buckets = BUCKETS.map((bucket) => {
    const rows = unpaid.filter((invoice) => {
      const age = daysSince(invoice.invoiceDate);
      return age >= bucket.min && age <= bucket.max;
    });
    return { ...bucket, count: rows.length, cents: sumCents(rows.map((row) => row.totalAmountCents)) };
  });
  const oldest = [...unpaid].sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate)).slice(0, 3);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("home.unpaid")}</CardTitle>
        <CardDescription>{t("home.unpaidHint")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{euros(total)}</p>
          <p className="text-sm text-muted-foreground">
            {unpaid.length} {unpaid.length === 1 ? t("home.invoice") : t("home.invoices")}
            {overdue.length > 0 ? t("home.overdueSuffix", { count: overdue.length }) : ""}
          </p>
        </div>

        {unpaid.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
            <CheckCircle2Icon className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span>{t("home.agingNone")}</span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">{t("home.aging")}</p>
              <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {buckets.map((bucket) =>
                  bucket.count > 0 && totalNumber > 0 ? (
                    <span
                      key={bucket.key}
                      className="h-full first:rounded-l-full last:rounded-r-full"
                      style={{ width: `${Math.max(2, (Number(bucket.cents) / totalNumber) * 100)}%`, background: bucket.color }}
                    />
                  ) : null,
                )}
              </div>
              <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
                {buckets.map((bucket) => (
                  <div key={bucket.key} className="flex items-center justify-between gap-2">
                    <dt className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-2 shrink-0 rounded-sm" style={{ background: bucket.color }} aria-hidden />
                      {t(`home.${bucket.key}`)}
                    </dt>
                    <dd className="font-medium tabular-nums">{euros(bucket.cents)}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-muted-foreground">{t("home.oldestDebtors")}</p>
              <ul className="flex flex-col divide-y">
                {oldest.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-1 last:pb-0">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{invoice.contactName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {invoice.seriesNumber} · {formatDate(invoice.invoiceDate)} · {t("home.daysAgo", { count: daysSince(invoice.invoiceDate) })}
                      </p>
                    </div>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums">{euros(invoice.totalAmountCents)}</span>
                      <ButtonLink
                        href={`/ingressos?recorda=${invoice.id}`}
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("home.remindAria", { series: invoice.seriesNumber })}
                        title={t("home.remind")}
                      >
                        <BellRingIcon />
                      </ButtonLink>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
