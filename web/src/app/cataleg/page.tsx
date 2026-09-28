"use client";

import { useCallback, useState } from "react";
import { PackageIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TAX_RATES } from "@/components/line-editor";
import { useOrganizationId } from "@/components/shell";
import {
  EmptyState,
  ErrorBanner,
  EuroInput,
  Field,
  FormDialog,
  NativeSelect,
  PageHeader,
  TableSkeleton,
  notifyError,
  notifySuccess,
  useLoad,
} from "@/components/ui-kit";
import { api } from "@/lib/api";
import { euroError, euroInput, euros, parseEuroInput } from "@/lib/money";

interface CatalogItem {
  id: string;
  name: string;
  unitAmountCents: string;
  taxRate: number;
}

interface Draft {
  id: string | null;
  name: string;
  price: string;
  taxRate: string;
}

export default function CatalogPage() {
  const organizationId = useOrganizationId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<{ name?: string; price?: string }>({});
  const [removing, setRemoving] = useState<CatalogItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const body = await api<{ items: CatalogItem[] }>(`/organizations/${organizationId}/catalog`);
    return body.items;
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, "No s’ha pogut carregar el catàleg");
  const items = data ?? [];
  const visible = query.trim() === "" ? items : items.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()));

  function openCreate() {
    setErrors({});
    setDraft({ id: null, name: "", price: "", taxRate: "21" });
  }

  function openEdit(item: CatalogItem) {
    setErrors({});
    setDraft({ id: item.id, name: item.name, price: euroInput(item.unitAmountCents), taxRate: String(item.taxRate) });
  }

  async function save() {
    if (draft === null) return;
    const next: typeof errors = {};
    if (draft.name.trim() === "") next.name = "Escriu el nom.";
    const priceError = euroError(draft.price, { allowZero: true });
    if (priceError) next.price = priceError;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const body = JSON.stringify({ name: draft.name.trim(), unitAmountCents: parseEuroInput(draft.price), taxRate: Number(draft.taxRate) });
      if (draft.id === null) {
        await api(`/organizations/${organizationId}/catalog`, { method: "POST", body });
        notifySuccess(`${draft.name.trim()} afegit al catàleg.`);
      } else {
        await api(`/organizations/${organizationId}/catalog/${draft.id}`, { method: "PATCH", body });
        notifySuccess(`${draft.name.trim()} actualitzat.`);
      }
      setDraft(null);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut desar el producte");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (removing === null) return;
    setBusy(true);
    try {
      await api(`/organizations/${organizationId}/catalog/${removing.id}`, { method: "DELETE" });
      notifySuccess(`${removing.name} eliminat del catàleg.`);
      setRemoving(null);
      await reload();
    } catch (cause) {
      notifyError(cause, "No s’ha pogut eliminar el producte");
    } finally {
      setBusy(false);
    }
  }

  const rowActions = (item: CatalogItem) => (
    <div className="flex justify-end gap-1">
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Edita ${item.name}`} onClick={() => openEdit(item)}>
        <PencilIcon />
      </Button>
      <Button type="button" size="icon-sm" variant="ghost" className="text-destructive" aria-label={`Elimina ${item.name}`} onClick={() => setRemoving(item)}>
        <Trash2Icon />
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title="Catàleg"
        description="Productes i serveis amb el preu i l’IVA, per omplir factures i sèries més de pressa."
        actions={
          <Button onClick={openCreate} disabled={initialLoading}>
            <PlusIcon /> Nou producte
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <TableSkeleton columns={4} />
      ) : data ? (
        items.length === 0 ? (
          <EmptyState
            icon={PackageIcon}
            title="Encara no hi ha productes ni serveis"
            hint="Afegeix el que factures sovint, com una hora de consultoria o una quota mensual."
            action={
              <Button onClick={openCreate}>
                <PlusIcon /> Nou producte
              </Button>
            }
          />
        ) : (
          <section aria-label="Productes i serveis" className="flex flex-col gap-3">
            <div className="relative max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input aria-label="Cerca al catàleg" placeholder="Cerca per nom" className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {visible.length === 0 ? (
              <EmptyState title="Cap producte coincideix amb la cerca" />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Nom</TableHead>
                        <TableHead className="text-right">Preu</TableHead>
                        <TableHead className="text-right">IVA</TableHead>
                        <TableHead className="text-right">Preu amb IVA</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">Accions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{euros(item.unitAmountCents)}</TableCell>
                          <TableCell className="text-right tabular-nums">{item.taxRate}%</TableCell>
                          <TableCell className="text-right tabular-nums">{euros(withTax(item))}</TableCell>
                          <TableCell className="text-right">{rowActions(item)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="flex flex-col gap-2 md:hidden">
                  {visible.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {euros(item.unitAmountCents)} · IVA {item.taxRate}%
                        </p>
                      </div>
                      {rowActions(item)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      ) : null}

      <FormDialog
        open={draft !== null}
        onOpenChange={(open) => !open && setDraft(null)}
        title={draft?.id ? "Edita el producte" : "Nou producte o servei"}
        description="Escriu el preu sense IVA, per exemple 3,5 o 3,50."
        submitLabel={draft?.id ? "Desa els canvis" : "Afegeix al catàleg"}
        busy={busy}
        onSubmit={save}
      >
        {draft ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem_6rem]">
            <Field id="catalog-name" label="Nom" error={errors.name}>
              <Input id="catalog-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
            </Field>
            <Field id="catalog-price" label="Preu" error={errors.price}>
              <EuroInput id="catalog-price" value={draft.price} onChange={(price) => setDraft({ ...draft, price })} />
            </Field>
            <Field id="catalog-rate" label="IVA">
              <NativeSelect id="catalog-rate" value={draft.taxRate} onChange={(event) => setDraft({ ...draft, taxRate: event.target.value })}>
                {TAX_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate}%
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        ) : null}
      </FormDialog>

      <FormDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Vols eliminar ${removing?.name ?? ""}?`}
        description="Desapareixerà del catàleg. Les factures que ja el fan servir no canvien."
        submitLabel="Elimina"
        busy={busy}
        destructive
        onSubmit={remove}
      />
    </>
  );
}

function withTax(item: CatalogItem): string {
  const base = BigInt(item.unitAmountCents);
  return (base + (base * BigInt(item.taxRate) + 50n) / 100n).toString();
}
