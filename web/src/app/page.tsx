"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { euros } from "@/lib/money";
import { useOrganizationId } from "@/components/shell";

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
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!organizationId) {
      return;
    }
    setLoading(true);
    setError(null);
    api<Dashboard>(`/organizations/${organizationId}/dashboard?from=2026-07-01&to=2026-09-30`)
      .then(setData)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No s'ha pogut carregar el trimestre"))
      .finally(() => setLoading(false));
  }, [organizationId]);

  if (!organizationId) {
    return <p className="text-sm text-muted-foreground">Crea l'organització per veure el trimestre.</p>;
  }
  if (loading) {
    return <p className="text-sm text-muted-foreground">Carregant el trimestre…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive" role="alert">{error}</p>;
  }
  if (data === null) {
    return <p className="text-sm text-muted-foreground">Encara no hi ha xifres.</p>;
  }

  const figures = [
    ["Ingressos", euros(data.incomeCents)],
    ["Despeses", euros(data.expenseCents)],
    ["Benefici", euros(data.profitCents)],
    ["IVA repercutit", euros(data.ivaRepercutitCents)],
    ["IVA suportat", euros(data.ivaSuportatCents)],
    ["Línies sense conciliar", String(data.unmatchedBankLines)],
  ];

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Inici · 3r trimestre 2026</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {figures.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
