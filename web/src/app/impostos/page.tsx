"use client";

import { useEffect, useState } from "react";
import { useOrganizationId } from "@/components/shell";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";

interface Bucket { rate: number; baseCents: string; taxCents: string }
interface Preview {
  disclaimer: string;
  issued: Bucket[];
  received: Bucket[];
}

export default function TaxesPage() {
  const organizationId = useOrganizationId();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    api<Preview>(`/organizations/${organizationId}/taxes/preview?from=2026-07-01&to=2026-09-30`)
      .then(setPreview)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No s'ha pogut carregar la previsualització"))
      .finally(() => setLoading(false));
  }, [organizationId]);

  if (!organizationId) return <p className="text-sm text-muted-foreground">Crea l'organització per veure els impostos.</p>;
  if (loading) return <p className="text-sm text-muted-foreground">Carregant la previsualització…</p>;
  if (error) return <p className="text-sm text-destructive" role="alert">{error}</p>;
  if (preview === null) return <p className="text-sm text-muted-foreground">Sense dades del trimestre.</p>;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Previsualització del model 303</h1>
      <p className="rounded-lg border bg-muted px-3 py-2 text-sm">Previsualització. No és una presentació a l'AEAT.</p>
      <RateTable title="IVA repercutit (factures emeses)" rows={preview.issued} />
      <RateTable title="IVA suportat (factures rebudes)" rows={preview.received} />
    </section>
  );
}

function RateTable({ title, rows }: { title: string; rows: Bucket[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Cap base en aquest període.</p> : null}
      {rows.map((row) => (
        <p key={row.rate} className="rounded-lg border p-3 text-sm">
          {row.rate}% · base {euros(row.baseCents)} · quota {euros(row.taxCents)}
        </p>
      ))}
    </div>
  );
}
