"use client";

import { useCallback, useEffect, useState } from "react";
import { InfoIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationId } from "@/components/shell";
import { EmptyState, ErrorBanner, LoadingRows, PageHeader, QuarterPicker, messageOf, quarterRange, useQuarter } from "@/components/ui-kit";
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

export default function TaxesPage() {
  const organizationId = useOrganizationId();
  const [quarter, setQuarter] = useQuarter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { from, to } = quarterRange(quarter);
    setLoading(true);
    setError(null);
    try {
      setPreview(await api<Preview>(`/organizations/${organizationId}/taxes/preview?from=${from}&to=${to}`));
    } catch (cause) {
      setError(messageOf(cause, "No s'ha pogut carregar la previsualització"));
    } finally {
      setLoading(false);
    }
  }, [organizationId, quarter]);

  useEffect(() => {
    void load();
  }, [load]);

  const output = sumTax(preview?.issued ?? []);
  const input = sumTax(preview?.received ?? []);
  const balance = output - input;

  return (
    <>
      <PageHeader
        title="Impostos"
        description="Previsualització del model 303 a partir de les factures emeses i rebudes del trimestre."
        actions={<QuarterPicker value={quarter} onChange={setQuarter} />}
      />
      <p className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        Previsualització orientativa. No és una presentació a l’AEAT.
      </p>
      <ErrorBanner message={error} onRetry={load} />
      {loading ? (
        <LoadingRows rows={4} />
      ) : preview ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <RateCard title="IVA repercutit" description="Factures emeses" rows={preview.issued} />
            <RateCard title="IVA suportat" description="Factures rebudes analitzades" rows={preview.received} />
          </div>
          <Card>
            <CardContent className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{balance < 0n ? "Resultat a compensar" : "Resultat a ingressar"}</p>
              <p className="text-2xl font-semibold tabular-nums">{euros(balance.toString())}</p>
            </CardContent>
          </Card>
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
                <TableCell className="text-right tabular-nums">{euros(base.toString())}</TableCell>
                <TableCell className="text-right tabular-nums">{euros(tax.toString())}</TableCell>
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
