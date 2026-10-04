"use client";

import { useState } from "react";
import { BarChart3Icon, TableIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useI18n } from "@/i18n";
import { euros } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface TrendMonth {
  month: string;
  incomeCents: string;
  expenseCents: string;
}

const PLOT_HEIGHT = 200;

/** Rounds up to a round multiple of a power of ten so the axis ticks read cleanly. */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((candidate) => candidate * power >= value) ?? 10;
  return step * power;
}

function monthLabel(month: string, locale: string, style: "short" | "long"): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2000, (index ?? 1) - 1, 1));
  const text = new Intl.DateTimeFormat(locale, { month: style, timeZone: "UTC", ...(style === "long" ? { year: "numeric" } : {}) }).format(date);
  return text.replace(".", "").replace(/^./, (first) => first.toUpperCase());
}

function compactEuros(cents: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100)} €`;
}

export function TrendChart({ months }: { months: TrendMonth[] }) {
  const { t, locale } = useI18n();
  const [hovered, setHovered] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  const values = months.map((row) => ({ income: Number(row.incomeCents), expense: Number(row.expenseCents) }));
  const max = niceCeil(Math.max(0, ...values.flatMap((row) => [row.income, row.expense])));
  const ticks = [max, max / 2, 0];
  const empty = values.every((row) => row.income === 0 && row.expense === 0);
  const totalIncome = months.reduce((total, row) => total + BigInt(row.incomeCents), 0n);
  const totalExpense = months.reduce((total, row) => total + BigInt(row.expenseCents), 0n);
  const active = hovered === null ? null : months[hovered];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul className="flex items-center gap-4 text-xs text-muted-foreground" aria-label={t("home.trendTitle")}>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-series-income" aria-hidden />
            {t("home.trendIncome")}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-series-expense" aria-hidden />
            {t("home.trendExpenses")}
          </li>
        </ul>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsTable((value) => !value)} aria-pressed={asTable}>
          {asTable ? <BarChart3Icon /> : <TableIcon />}
          {asTable ? t("home.trendShowChart") : t("home.trendShowTable")}
        </Button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("home.trendMonth")}</TableHead>
                <TableHead className="text-right">{t("home.trendIncome")}</TableHead>
                <TableHead className="text-right">{t("home.trendExpenses")}</TableHead>
                <TableHead className="text-right">{t("home.trendResult")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((row) => (
                <TableRow key={row.month}>
                  <TableCell>{monthLabel(row.month, locale, "long")}</TableCell>
                  <TableCell className="text-right tabular-nums">{euros(row.incomeCents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{euros(row.expenseCents)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {euros((BigInt(row.incomeCents) - BigInt(row.expenseCents)).toString())}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : empty ? (
        <div className="flex h-[200px] items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">{t("home.trendEmpty")}</div>
      ) : (
        <div className="relative pl-12" onMouseLeave={() => setHovered(null)}>
          {/* Recessive grid and y-axis labels. */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: PLOT_HEIGHT }} aria-hidden>
            {ticks.map((tick) => (
              <div key={tick} className="absolute inset-x-0 flex items-center" style={{ top: `${(1 - tick / max) * 100}%` }}>
                <span className="w-12 -translate-y-1/2 pr-2 text-right text-[11px] text-muted-foreground tabular-nums">{compactEuros(tick, locale)}</span>
                <span className={cn("h-px flex-1 -translate-y-1/2", tick === 0 ? "bg-border" : "border-t border-dashed border-border/70")} />
              </div>
            ))}
          </div>

          <div className="relative">
            <ol className="relative flex items-end" style={{ height: PLOT_HEIGHT }} aria-label={t("home.trendTitle")}>
              {months.map((row, index) => {
                const value = values[index] ?? { income: 0, expense: 0 };
                const incomeHeight = (Math.max(0, value.income) / max) * 100;
                const expenseHeight = (Math.max(0, value.expense) / max) * 100;
                return (
                  <li
                    key={row.month}
                    className="group relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                    tabIndex={0}
                    onMouseEnter={() => setHovered(index)}
                    onFocus={() => setHovered(index)}
                    onBlur={() => setHovered(null)}
                    aria-label={`${monthLabel(row.month, locale, "long")}: ${t("home.trendIncome")} ${euros(row.incomeCents)}, ${t("home.trendExpenses")} ${euros(row.expenseCents)}`}
                  >
                    <span
                      className={cn("absolute inset-0 rounded-md transition-colors", hovered === index ? "bg-muted/70" : "group-focus-visible:bg-muted/70")}
                      aria-hidden
                    />
                    <span className="relative flex h-full w-3/5 max-w-9 items-end justify-center gap-0.5" aria-hidden>
                      <span className="flex-1 rounded-t-[4px] bg-series-income transition-[height] duration-500" style={{ height: `${incomeHeight}%` }} />
                      <span className="flex-1 rounded-t-[4px] bg-series-expense transition-[height] duration-500" style={{ height: `${expenseHeight}%` }} />
                    </span>
                  </li>
                );
              })}
            </ol>
            {active !== null && hovered !== null ? (
              <div
                role="status"
                className="pointer-events-none absolute top-2 z-10 w-48 rounded-lg border bg-popover p-2.5 text-xs text-popover-foreground shadow-lg"
                style={{
                  left: `${((hovered + 0.5) / months.length) * 100}%`,
                  transform: hovered > months.length / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
                }}
              >
                <p className="mb-1.5 font-medium">{monthLabel(active.month, locale, "long")}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-sm bg-series-income" aria-hidden />
                    {t("home.trendIncome")}
                  </dt>
                  <dd className="text-right tabular-nums">{euros(active.incomeCents)}</dd>
                  <dt className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2 rounded-sm bg-series-expense" aria-hidden />
                    {t("home.trendExpenses")}
                  </dt>
                  <dd className="text-right tabular-nums">{euros(active.expenseCents)}</dd>
                  <div className="col-span-2 my-0.5 border-t" aria-hidden />
                  <dt className="text-muted-foreground">{t("home.trendResult")}</dt>
                  <dd className="text-right font-medium tabular-nums">{euros((BigInt(active.incomeCents) - BigInt(active.expenseCents)).toString())}</dd>
                </dl>
              </div>
            ) : null}
          </div>

          <ol className="mt-2 flex" aria-hidden>
            {months.map((row, index) => (
              <li
                key={row.month}
                className={cn(
                  "flex-1 text-center text-[11px] text-muted-foreground",
                  index % 2 === 1 && "max-sm:invisible",
                  hovered === index && "font-medium text-foreground",
                )}
              >
                {monthLabel(row.month, locale, "short")}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t("home.trendTotal", { income: euros(totalIncome.toString()), expenses: euros(totalExpense.toString()) })}
      </p>
    </div>
  );
}
