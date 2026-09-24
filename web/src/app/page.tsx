"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganizationId } from "@/components/shell";
import { ErrorBanner, LoadingRows, PageHeader, QuarterPicker, messageOf, quarterRange, useQuarter } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Dashboard {
  incomeCents: string;
  expenseCents: string;
  profitCents: string;
  ivaRepercutitCents: string;
  ivaSuportatCents: string;
  unmatchedBankLines: number;
}

export default function HomePage() {
  const organizationId = useOrganizationId();
  const [quarter, setQuarter] = useQuarter();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { from, to } = quarterRange(quarter);
    setLoading(true);
    setError(null);
    try {
      setData(await api<Dashboard>(`/organizations/${organizationId}/dashboard?from=${from}&to=${to}`));
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut carregar el trimestre"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, quarter]);

  useEffect(() => {
    void load();
  }, [load]);

  const vatBalance = data === null ? null : (BigInt(data.ivaRepercutitCents) - BigInt(data.ivaSuportatCents)).toString();

  return (
    <>
      <PageHeader
        title="Inici"
        description="Resum del trimestre amb les factures emeses, les despeses analitzades i el banc."
        actions={<QuarterPicker value={quarter} onChange={setQuarter} />}
      />
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LoadingRows rows={3} />
          <LoadingRows rows={3} />
          <LoadingRows rows={3} />
        </div>
      ) : data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="Ingressos" value={euros(data.incomeCents)} />
            <Figure label="Despeses" value={euros(data.expenseCents)} />
            <Figure
              label="Benefici"
              value={euros(data.profitCents)}
              tone={data.profitCents.startsWith("-") ? "negative" : "positive"}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="IVA repercutit" value={euros(data.ivaRepercutitCents)} hint="De les factures emeses" />
            <Figure label="IVA suportat" value={euros(data.ivaSuportatCents)} hint="De les factures rebudes" />
            <Figure
              label="Diferència d'IVA"
              value={euros(vatBalance)}
              hint={vatBalance?.startsWith("-") ? "A compensar" : "A ingressar (previsió)"}
            />
          </div>
          <Card>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Moviments bancaris sense conciliar</p>
                <p className="text-2xl font-semibold tabular-nums">{data.unmatchedBankLines}</p>
              </div>
              <Link href="/banc" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Revisa el banc <ArrowRightIcon className="size-4" />
              </Link>
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p
          className={cn(
            "text-2xl font-semibold tabular-nums",
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
