"use client";

import { useCallback } from "react";
import { InfoIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationId } from "@/components/shell";
import { CardsSkeleton, EmptyState, ErrorBanner, KpiCard, PageHeader, QuarterPicker, quarterRange, useLoad, useQuarter } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";

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
}

export default function TaxesPage() {
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

  const { data, error, loading, reload } = useLoad(load, "No s’ha pogut carregar la previsualització");

  const output = sumTax(data?.model303.issued ?? []);
  const input = sumTax(data?.model303.received ?? []);
  const balance = output - input;

  return (
    <>
      <PageHeader
        title="Impostos"
        description="Previsió dels models 303 (IVA) i 130 (IRPF) a partir de les factures del trimestre."
        actions={<QuarterPicker value={quarter} onChange={setQuarter} />}
      />
      <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        Previsualització orientativa. No és una presentació a l’AEAT; revisa-la amb la teva gestoria.
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
            <KpiCard label={balance < 0n ? "Model 303 · a compensar" : "Model 303 · a ingressar"} value={euros((balance < 0n ? -balance : balance).toString())} hint="IVA repercutit menys suportat" />
            <KpiCard label="Model 130 · a ingressar" value={euros(data.model130.paymentCents)} hint="20% del rendiment net" />
            <KpiCard
              label="Rendiment net"
              value={euros(data.model130.netCents)}
              hint={`Ingressos ${euros(data.model130.incomeCents)} · despeses ${euros(data.model130.expenseCents)}`}
              tone={data.model130.netCents.startsWith("-") ? "negative" : undefined}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <RateCard title="IVA repercutit" description="De les factures emeses" rows={data.model303.issued} />
            <RateCard title="IVA suportat" description="De les factures rebudes analitzades" rows={data.model303.received} />
          </div>
        </>
      ) : null}
    </>
  );
}

function RateCard({ title, description, rows }: { title: string; description: string; rows: Bucket[] }) {
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
          <EmptyState title="Cap base en aquest trimestre" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipus</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Quota</TableHead>
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
                <TableCell>Total</TableCell>
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
