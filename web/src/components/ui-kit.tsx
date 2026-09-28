"use client";

import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangleIcon, InboxIcon, RotateCwIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n";
import { dictFor, getLocale, monthsFor, translate } from "@/i18n/core";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-base font-semibold">{title}</h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  const t = useT();
  if (message === null) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="flex items-start gap-2">
        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {message}
      </span>
      {onRetry ? (
        <Button type="button" variant="outline" size="sm" className="self-start sm:self-auto" onClick={onRetry}>
          <RotateCwIcon /> {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
  icon: Icon = InboxIcon,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 4, columns = 5 }: { rows?: number; columns?: number }) {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-xl border" aria-busy="true" aria-label={t("common.loading")}>
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex gap-4 border-b px-4 py-4 last:border-b-0">
          {Array.from({ length: columns }, (_, index) => (
            <Skeleton key={index} className={cn("h-4 flex-1", index === 0 && "flex-[1.5]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  const t = useT();
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)} aria-busy="true" aria-label={t("common.loading")}>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} size="sm">
          <CardHeader>
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function Field({
  id,
  label,
  children,
  className,
  hint,
  error,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
  hint?: string;
  error?: string | null;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const child = Children.only(children);
  const control = isValidElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>(child)
    ? cloneElement(child, { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })
    : child;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && !error ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        props.className,
      )}
    />
  );
}

export function EuroInput({
  className,
  onBlur,
  onChange,
  value,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <input
        {...props}
        value={value}
        inputMode="decimal"
        autoComplete="off"
        placeholder={props.placeholder ?? "0,00"}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => {
          const normalized = normalizeEuro(event.target.value);
          if (normalized !== null && normalized !== value) onChange(normalized);
          onBlur?.(event);
        }}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent py-1 pr-7 pl-2.5 text-right text-base tabular-nums transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
          className,
        )}
      />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground" aria-hidden>
        €
      </span>
    </div>
  );
}

function normalizeEuro(raw: string): string | null {
  const value = raw.trim().replace("€", "").replace(/\s/g, "");
  let clean = value;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(clean)) clean = clean.replace(/\./g, "");
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(clean);
  if (!match) return null;
  const whole = BigInt(match[1] ?? "0").toString();
  return `${whole},${(match[2] ?? "").padEnd(2, "0")}`;
}

const TONES = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  info: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  violet: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  neutral: "bg-muted text-muted-foreground",
} as const;

export type Tone = keyof typeof TONES;

export function StatusBadge({ tone, children, title }: { tone: Tone; children: React.ReactNode; title?: string }) {
  return (
    <Badge className={TONES[tone]} title={title}>
      {children}
    </Badge>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<readonly [T, string] | readonly [T, string, number]>;
}) {
  return (
    <div className="inline-flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-sm" role="radiogroup" aria-label={label}>
      {options.map(([option, text, count]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          className={cn(
            "shrink-0 rounded-md px-3 py-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => onChange(option)}
        >
          {text}
          {count !== undefined ? <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums",
            tone === "positive" && "text-emerald-700 dark:text-emerald-300",
            tone === "negative" && "text-red-700 dark:text-red-300",
          )}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  busy,
  onSubmit,
  children,
  wide,
  destructive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: () => void | Promise<void>;
  children?: React.ReactNode;
  wide?: boolean;
  destructive?: boolean;
}) {
  const t = useT();
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className={cn("max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg", wide && "sm:max-w-3xl")}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>{t("common.cancel")}</DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy}>
              {busy ? t("common.wait") : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Loads data for a page. Keeps the previous data while it reloads, so only the first load shows skeletons. */
export function useLoad<T>(load: () => Promise<T>, fallback: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const next = await load();
      if (current === generation.current) setData(next);
    } catch (cause) {
      if (current === generation.current) setError(messageOf(cause, fallback));
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [load, fallback]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, initialLoading: loading && data === null, reload };
}

export function notifySuccess(message: string) {
  toast.success(message);
}

export function notifyError(cause: unknown, fallback: string) {
  toast.error(messageOf(cause, fallback));
}

export interface Quarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export function quarterRange({ year, quarter }: Quarter): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  return monthsRange(year, startMonth, startMonth + 2);
}

function monthsRange(year: number, startMonth: number, endMonth: number): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return {
    from: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    to: `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function currentQuarter(): Quarter {
  const now = new Date();
  return { year: now.getUTCFullYear(), quarter: (Math.floor(now.getUTCMonth() / 3) + 1) as Quarter["quarter"] };
}

export function useQuarter(): [Quarter, (next: Quarter) => void] {
  const [value, setValue] = useState<Quarter>(currentQuarter);
  return [value, setValue];
}

export function QuarterPicker({ value, onChange }: { value: Quarter; onChange: (next: Quarter) => void }) {
  const t = useT();
  const quarters = dictFor(getLocale()).period.quarterN;
  const thisYear = new Date().getUTCFullYear();
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1];
  return (
    <div className="flex gap-2">
      <NativeSelect
        aria-label={t("period.ariaQuarter")}
        className="w-auto"
        value={value.quarter}
        onChange={(event) => onChange({ ...value, quarter: Number(event.target.value) as Quarter["quarter"] })}
      >
        <option value={1}>{quarters[0]}</option>
        <option value={2}>{quarters[1]}</option>
        <option value={3}>{quarters[2]}</option>
        <option value={4}>{quarters[3]}</option>
      </NativeSelect>
      <NativeSelect aria-label={t("period.ariaYear")} className="w-auto" value={value.year} onChange={(event) => onChange({ ...value, year: Number(event.target.value) })}>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/** @deprecated Prefer monthsFor() from i18n — kept for callers that need a static list. */
export const MONTHS = monthsFor("ca");

export type Period =
  | { kind: "month"; year: number; month: number }
  | { kind: "quarter"; year: number; quarter: Quarter["quarter"] }
  | { kind: "year"; year: number };

export function currentPeriod(kind: Period["kind"] = "quarter"): Period {
  const now = new Date();
  const year = now.getUTCFullYear();
  if (kind === "month") return { kind, year, month: now.getUTCMonth() + 1 };
  if (kind === "year") return { kind, year };
  return { kind, year, quarter: currentQuarter().quarter };
}

export function periodRange(period: Period): { from: string; to: string } {
  if (period.kind === "month") return monthsRange(period.year, period.month, period.month);
  if (period.kind === "year") return monthsRange(period.year, 1, 12);
  return quarterRange(period);
}

export function periodLabel(period: Period): string {
  const locale = getLocale();
  const dict = dictFor(locale);
  if (period.kind === "month") {
    return translate(locale, "period.monthOf", { month: dict.period.months[period.month - 1] ?? "", year: period.year });
  }
  if (period.kind === "year") {
    return translate(locale, "period.yearOf", { year: period.year });
  }
  return translate(locale, "period.quarterOf", { quarter: dict.period.quarterShort[period.quarter - 1] ?? "", year: period.year });
}

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (next: Period) => void }) {
  const t = useT();
  const months = monthsFor(getLocale());
  const quarters = dictFor(getLocale()).period.quarterN;
  const thisYear = new Date().getUTCFullYear();
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label={t("period.type")}
        value={value.kind}
        onChange={(kind) => {
          const next = currentPeriod(kind);
          onChange({ ...next, year: value.year } as Period);
        }}
        options={[
          ["month", t("period.month")],
          ["quarter", t("period.quarter")],
          ["year", t("period.year")],
        ]}
      />
      {value.kind === "month" ? (
        <NativeSelect aria-label={t("period.ariaMonth")} className="w-auto" value={value.month} onChange={(event) => onChange({ ...value, month: Number(event.target.value) })}>
          {months.map((name, index) => (
            <option key={name} value={index + 1}>
              {name.charAt(0).toUpperCase() + name.slice(1)}
            </option>
          ))}
        </NativeSelect>
      ) : null}
      {value.kind === "quarter" ? (
        <NativeSelect
          aria-label={t("period.ariaQuarter")}
          className="w-auto"
          value={value.quarter}
          onChange={(event) => onChange({ ...value, quarter: Number(event.target.value) as Quarter["quarter"] })}
        >
          <option value={1}>{quarters[0]}</option>
          <option value={2}>{quarters[1]}</option>
          <option value={3}>{quarters[2]}</option>
          <option value={4}>{quarters[3]}</option>
        </NativeSelect>
      ) : null}
      <NativeSelect aria-label={t("period.ariaYear")} className="w-auto" value={value.year} onChange={(event) => onChange({ ...value, year: Number(event.target.value) } as Period)}>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDate(value: string | null): string {
  if (value === null) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export function sumCents(values: Array<string | null | undefined>): string {
  return values.reduce((total, value) => total + (value ? BigInt(value) : 0n), 0n).toString();
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
