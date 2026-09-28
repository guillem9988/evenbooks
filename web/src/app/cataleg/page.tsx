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
import { useT } from "@/i18n";
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
  const t = useT();
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

  const { data, error, initialLoading, reload } = useLoad(load, t("catalog.loadFailed"));
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
    if (draft.name.trim() === "") next.name = t("validation.writeName");
    const priceError = euroError(draft.price, {
      allowZero: true,
      messages: { required: t("money.required"), invalid: t("money.invalid"), zero: t("money.zero") },
    });
    if (priceError) next.price = priceError;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    try {
      const body = JSON.stringify({ name: draft.name.trim(), unitAmountCents: parseEuroInput(draft.price), taxRate: Number(draft.taxRate) });
      if (draft.id === null) {
        await api(`/organizations/${organizationId}/catalog`, { method: "POST", body });
        notifySuccess(t("catalog.added", { name: draft.name.trim() }));
      } else {
        await api(`/organizations/${organizationId}/catalog/${draft.id}`, { method: "PATCH", body });
        notifySuccess(t("catalog.updated", { name: draft.name.trim() }));
      }
      setDraft(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("catalog.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (removing === null) return;
    setBusy(true);
    try {
      await api(`/organizations/${organizationId}/catalog/${removing.id}`, { method: "DELETE" });
      notifySuccess(t("catalog.removed", { name: removing.name }));
      setRemoving(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("catalog.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  const rowActions = (item: CatalogItem) => (
    <div className="flex justify-end gap-1">
      <Button type="button" size="icon-sm" variant="ghost" aria-label={t("catalog.edit", { name: item.name })} onClick={() => openEdit(item)}>
        <PencilIcon />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-destructive"
        aria-label={t("catalog.remove", { name: item.name })}
        onClick={() => setRemoving(item)}
      >
        <Trash2Icon />
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("catalog.title")}
        description={t("catalog.description")}
        actions={
          <Button onClick={openCreate} disabled={initialLoading}>
            <PlusIcon /> {t("catalog.newProduct")}
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
            title={t("catalog.empty")}
            hint={t("catalog.emptyHint")}
            action={
              <Button onClick={openCreate}>
                <PlusIcon /> {t("catalog.newProduct")}
              </Button>
            }
          />
        ) : (
          <section aria-label={t("catalog.listLabel")} className="flex flex-col gap-3">
            <div className="relative max-w-sm">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                aria-label={t("catalog.search")}
                placeholder={t("catalog.searchPlaceholder")}
                className="pl-8"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            {visible.length === 0 ? (
              <EmptyState title={t("catalog.emptySearch")} />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>{t("common.name")}</TableHead>
                        <TableHead className="text-right">{t("common.price")}</TableHead>
                        <TableHead className="text-right">{t("common.vat")}</TableHead>
                        <TableHead className="text-right">{t("catalog.priceWithVat")}</TableHead>
                        <TableHead className="text-right">
                          <span className="sr-only">{t("common.actions")}</span>
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
                          {euros(item.unitAmountCents)} · {t("common.vat")} {item.taxRate}%
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
        title={draft?.id ? t("catalog.editTitle") : t("catalog.createTitle")}
        description={t("catalog.formHint")}
        submitLabel={draft?.id ? t("catalog.saveChanges") : t("catalog.addToCatalog")}
        busy={busy}
        onSubmit={save}
      >
        {draft ? (
          <div className="grid gap-3 sm:grid-cols-[1fr_9rem_6rem]">
            <Field id="catalog-name" label={t("common.name")} error={errors.name}>
              <Input id="catalog-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoFocus />
            </Field>
            <Field id="catalog-price" label={t("common.price")} error={errors.price}>
              <EuroInput id="catalog-price" value={draft.price} onChange={(price) => setDraft({ ...draft, price })} />
            </Field>
            <Field id="catalog-rate" label={t("common.vat")}>
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
        title={t("catalog.removeTitle", { name: removing?.name ?? "" })}
        description={t("catalog.removeDescription")}
        submitLabel={t("catalog.removeSubmit")}
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
