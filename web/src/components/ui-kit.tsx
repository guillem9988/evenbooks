"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  if (message === null) return null;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
    >
      <span>{message}</span>
      {onRetry ? (
        <button type="button" className="self-start font-medium underline underline-offset-4 sm:self-auto" onClick={onRetry}>
          Torna-ho a provar
        </button>
      ) : null}
    </div>
  );
}

export function Notice({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="status" className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
      {message}
    </p>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregant">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

export function Field({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

export function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        props.className,
      )}
    />
  );
}

const TONES = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  neutral: "bg-muted text-muted-foreground",
} as const;

export function StatusBadge({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <Badge className={TONES[tone]}>{children}</Badge>;
}

export interface Quarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

export function quarterRange({ year, quarter }: Quarter): { from: string; to: string } {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
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
  const years = [value.year - 1, value.year, value.year + 1];
  return (
    <div className="flex gap-2">
      <NativeSelect
        aria-label="Trimestre"
        className="w-auto"
        value={value.quarter}
        onChange={(event) => onChange({ ...value, quarter: Number(event.target.value) as Quarter["quarter"] })}
      >
        <option value={1}>1r trimestre</option>
        <option value={2}>2n trimestre</option>
        <option value={3}>3r trimestre</option>
        <option value={4}>4t trimestre</option>
      </NativeSelect>
      <NativeSelect
        aria-label="Any"
        className="w-auto"
        value={value.year}
        onChange={(event) => onChange({ ...value, year: Number(event.target.value) })}
      >
        {years.map((year) => (
          <option key={year} value={year}>{year}</option>
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
