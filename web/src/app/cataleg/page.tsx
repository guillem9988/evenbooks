"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useOrganizationId } from "@/components/shell";
import { EmptyState, ErrorBanner, Field, LoadingRows, NativeSelect, Notice, PageHeader, messageOf } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euroInput, euros, parseEuroInput } from "@/lib/money";

interface CatalogItem {
  id: string;
  name: string;
  unitAmountCents: string;
  taxRate: number;
}

export default function CatalogPage() {
  const organizationId = useOrganizationId();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [taxRate, setTaxRate] = useState("21");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftRate, setDraftRate] = useState("21");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const body = await api<{ items: CatalogItem[] }>(`/organizations/${organizationId}/catalog`);
      setItems(body.items);
    } catch (cause) {
      setError(messageOf(cause, "No s’ha pogut carregar el catàleg"));
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createItem(event: React.FormEvent) {
    event.preventDefault();
    const unitAmountCents = parseEuroInput(price);
    if (unitAmountCents === null) {
      setError("El preu ha de ser en euros, per exemple 3,50.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/catalog`, {
        method: "POST",
        body: JSON.stringify({ name, unitAmountCents, taxRate: Number(taxRate) }),
      });
      setNotice(`${name} afegit al catàleg.`);
      setName("");
      setPrice("");
      setTaxRate("21");
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s’ha pogut crear el producte"));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(item: CatalogItem) {
    setEditing(item.id);
    setDraftName(item.name);
    setDraftPrice(euroInput(item.unitAmountCents));
    setDraftRate(String(item.taxRate));
  }

  async function saveEdit(id: string) {
    const unitAmountCents = parseEuroInput(draftPrice);
    if (unitAmountCents === null) {
      setError("El preu ha de ser en euros, per exemple 3,50.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/catalog/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: draftName, unitAmountCents, taxRate: Number(draftRate) }),
      });
      setEditing(null);
      setNotice("Producte actualitzat.");
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s’ha pogut actualitzar el producte"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: CatalogItem) {
    setBusy(true);
    setError(null);
    try {
      await api(`/organizations/${organizationId}/catalog/${item.id}`, { method: "DELETE" });
      setNotice(`${item.name} eliminat.`);
      await load();
    } catch (cause) {
      setError(messageOf(cause, "No s’ha pogut eliminar el producte"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Catàleg" description="Productes i serveis amb el preu i l’IVA, per omplir les factures." />
      <ErrorBanner message={error} onRetry={load} />
      <Notice message={notice} />
      <Card>
        <CardHeader>
          <CardTitle>Nou producte o servei</CardTitle>
          <CardDescription>Escriu el preu en euros, per exemple 3,5 o 3,50.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={createItem}>
            <Field id="catalog-name" label="Nom">
              <Input id="catalog-name" value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field id="catalog-price" label="Preu">
              <Input id="catalog-price" inputMode="decimal" placeholder="3,50" value={price} onChange={(event) => setPrice(event.target.value)} required />
            </Field>
            <Field id="catalog-rate" label="IVA">
              <NativeSelect id="catalog-rate" value={taxRate} onChange={(event) => setTaxRate(event.target.value)}>
                <option value="21">21%</option>
                <option value="10">10%</option>
                <option value="4">4%</option>
                <option value="0">0%</option>
              </NativeSelect>
            </Field>
            <Button type="submit" className="self-end" disabled={busy}>
              {busy ? "Desant…" : "Afegeix"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Llista</h2>
        {loading ? (
          <LoadingRows />
        ) : items.length === 0 ? (
          <EmptyState title="Encara no hi ha productes ni serveis" hint="Afegeix el primer amb el formulari de dalt." />
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border p-3">
                {editing === item.id ? (
                  <div className="grid gap-2 sm:grid-cols-[1fr_8rem_6rem_auto] sm:items-end">
                    <Input value={draftName} onChange={(event) => setDraftName(event.target.value)} aria-label="Nom" required />
                    <Input value={draftPrice} onChange={(event) => setDraftPrice(event.target.value)} aria-label="Preu" inputMode="decimal" required />
                    <NativeSelect value={draftRate} onChange={(event) => setDraftRate(event.target.value)} aria-label="IVA">
                      <option value="21">21%</option>
                      <option value="10">10%</option>
                      <option value="4">4%</option>
                      <option value="0">0%</option>
                    </NativeSelect>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={busy} onClick={() => saveEdit(item.id)}>Desa</Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel·la</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {euros(item.unitAmountCents)} · IVA {item.taxRate}%
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startEdit(item)}>Edita</Button>
                      <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => remove(item)}>Elimina</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
