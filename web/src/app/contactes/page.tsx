"use client";

import { useCallback, useEffect, useState } from "react";
import { PencilIcon, PlusIcon, SearchIcon, Trash2Icon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useOrganizationId } from "@/components/shell";
import { RoleBadge } from "@/components/status-badges";
import {
  EMAIL,
  EmptyState,
  ErrorBanner,
  Field,
  FormDialog,
  NativeSelect,
  PageHeader,
  Segmented,
  TableSkeleton,
  notifyError,
  notifySuccess,
  useLoad,
} from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api } from "@/lib/api";

type Role = "CLIENT" | "SUPPLIER";

interface Contact {
  id: string;
  legalName: string;
  taxId: string;
  email: string;
  role: Role;
}

interface ContactDraft {
  id: string | null;
  legalName: string;
  taxId: string;
  email: string;
  role: Role;
}

type Errors = Partial<Record<"legalName" | "taxId" | "email", string>>;

const TAX_ID = /^[A-Z0-9][A-Z0-9-]{3,}$/;

export default function ContactsPage() {
  const t = useT();
  const organizationId = useOrganizationId();
  const [filter, setFilter] = useState<Role | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<ContactDraft | null>(null);
  const [removing, setRemoving] = useState<Contact | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const body = await api<{ contacts: Contact[] }>(`/organizations/${organizationId}/contacts`);
    return body.contacts;
  }, [organizationId]);

  const { data, error, initialLoading, reload } = useLoad(load, t("contacts.loadFailed"));
  const contacts = data ?? [];

  function openCreate() {
    setDraft({
      id: null,
      legalName: "",
      taxId: "",
      email: "",
      role: "CLIENT",
    });
    setErrors({});
  }

  function openEdit(contact: Contact) {
    setDraft({
      id: contact.id,
      legalName: contact.legalName,
      taxId: contact.taxId,
      email: contact.email,
      role: contact.role,
    });
    setErrors({});
  }

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("nou") === "1") {
      openCreate();
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = contacts.filter(
    (contact) =>
      (filter === "ALL" || contact.role === filter) &&
      (needle === "" || contact.legalName.toLowerCase().includes(needle) || contact.taxId.toLowerCase().includes(needle) || contact.email.toLowerCase().includes(needle)),
  );
  const clients = contacts.filter((contact) => contact.role === "CLIENT").length;

  async function saveContact() {
    if (!draft) return;
    const next: Errors = {};
    if (draft.legalName.trim() === "") next.legalName = t("validation.legalName");
    if (!TAX_ID.test(draft.taxId.trim().toUpperCase())) next.taxId = t("validation.taxIdFormat");
    if (!EMAIL.test(draft.email.trim())) next.email = t("validation.email");
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const body = JSON.stringify({
        legalName: draft.legalName.trim(),
        taxId: draft.taxId.trim().toUpperCase(),
        email: draft.email.trim(),
        role: draft.role,
      });

      if (draft.id === null) {
        await api(`/organizations/${organizationId}/contacts`, {
          method: "POST",
          body,
        });
        notifySuccess(
          draft.role === "CLIENT"
            ? t("contacts.addedClient", { name: draft.legalName.trim() })
            : t("contacts.addedSupplier", { name: draft.legalName.trim() }),
        );
      } else {
        await api(`/organizations/${organizationId}/contacts/${draft.id}`, {
          method: "PATCH",
          body,
        });
        notifySuccess(t("contacts.updated"));
      }
      setDraft(null);
      await reload();
    } catch (cause) {
      notifyError(cause, draft.id === null ? t("contacts.createFailed") : t("contacts.editFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function removeContact() {
    if (!removing) return;
    setBusy(true);
    try {
      await api(`/organizations/${organizationId}/contacts/${removing.id}`, {
        method: "DELETE",
      });
      notifySuccess(t("contacts.deleteSuccess"));
      setRemoving(null);
      await reload();
    } catch (cause) {
      notifyError(cause, t("contacts.deleteFailed"));
    } finally {
      setBusy(false);
    }
  }

  const rowActions = (contact: Contact) => (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={t("contacts.edit")}
        title={t("contacts.edit")}
        onClick={() => openEdit(contact)}
      >
        <PencilIcon className="size-4" />
      </Button>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        aria-label={t("contacts.delete")}
        title={t("contacts.delete")}
        onClick={() => setRemoving(contact)}
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader
        title={t("contacts.title")}
        description={t("contacts.description")}
        actions={
          <Button onClick={openCreate} disabled={initialLoading}>
            <PlusIcon /> {t("contacts.newContact")}
          </Button>
        }
      />
      <ErrorBanner message={error} onRetry={reload} />

      {initialLoading ? (
        <TableSkeleton columns={5} />
      ) : data ? (
        contacts.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={t("contacts.empty")}
            hint={t("contacts.emptyHint")}
            action={
              <Button onClick={openCreate}>
                <PlusIcon /> {t("contacts.newContact")}
              </Button>
            }
          />
        ) : (
          <section aria-label={t("contacts.listLabel")} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Segmented
                label={t("contacts.filter")}
                value={filter}
                onChange={setFilter}
                options={[
                  ["ALL", t("contacts.all"), contacts.length],
                  ["CLIENT", t("contacts.clients"), clients],
                  ["SUPPLIER", t("contacts.suppliers"), contacts.length - clients],
                ]}
              />
              <div className="relative sm:w-72">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input aria-label={t("contacts.search")} placeholder={t("contacts.searchPlaceholder")} className="pl-8" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>
            {visible.length === 0 ? (
              <EmptyState title={t("contacts.emptySearch")} hint={t("contacts.emptySearchHint")} />
            ) : (
              <>
                <div className="hidden overflow-hidden rounded-xl border md:block">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>{t("common.legalName")}</TableHead>
                        <TableHead>{t("common.taxId")}</TableHead>
                        <TableHead>{t("common.email")}</TableHead>
                        <TableHead>{t("common.role")}</TableHead>
                        <TableHead className="w-24 text-right">{t("contacts.actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map((contact) => (
                        <TableRow key={contact.id}>
                          <TableCell className="font-medium">{contact.legalName}</TableCell>
                          <TableCell className="font-mono text-xs">{contact.taxId}</TableCell>
                          <TableCell className="max-w-64 truncate">
                            <a href={`mailto:${contact.email}`} className="underline-offset-4 hover:underline">
                              {contact.email}
                            </a>
                          </TableCell>
                          <TableCell>
                            <RoleBadge role={contact.role} />
                          </TableCell>
                          <TableCell className="text-right">{rowActions(contact)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <ul className="flex flex-col gap-2 md:hidden">
                  {visible.map((contact) => (
                    <li key={contact.id} className="flex flex-col gap-2 rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{contact.legalName}</p>
                          <p className="font-mono text-xs text-muted-foreground">{contact.taxId}</p>
                        </div>
                        <RoleBadge role={contact.role} />
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1 border-t">
                        <p className="truncate text-sm text-muted-foreground">
                          <a href={`mailto:${contact.email}`} className="underline-offset-4 hover:underline">
                            {contact.email}
                          </a>
                        </p>
                        {rowActions(contact)}
                      </div>
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
        title={draft?.id === null ? t("contacts.dialogTitle") : t("contacts.editTitle")}
        description={draft?.id === null ? t("contacts.dialogDescription") : t("contacts.editDescription")}
        submitLabel={draft?.id === null ? t("contacts.dialogSubmit") : t("contacts.editSubmit")}
        busy={busy}
        onSubmit={saveContact}
      >
        {draft && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="contact-name" label={t("common.legalName")} error={errors.legalName} className="sm:col-span-2">
              <Input
                id="contact-name"
                autoComplete="organization"
                value={draft.legalName}
                onChange={(event) => setDraft({ ...draft, legalName: event.target.value })}
                autoFocus
              />
            </Field>
            <Field id="contact-tax" label={t("common.taxId")} error={errors.taxId}>
              <Input
                id="contact-tax"
                value={draft.taxId}
                onChange={(event) => setDraft({ ...draft, taxId: event.target.value.toUpperCase() })}
                placeholder="B12345678"
              />
            </Field>
            <Field id="contact-role" label={t("common.role")}>
              <NativeSelect
                id="contact-role"
                value={draft.role}
                onChange={(event) => setDraft({ ...draft, role: event.target.value as Role })}
              >
                <option value="CLIENT">{t("contacts.client")}</option>
                <option value="SUPPLIER">{t("contacts.supplier")}</option>
              </NativeSelect>
            </Field>
            <Field id="contact-email" label={t("common.email")} error={errors.email} className="sm:col-span-2">
              <Input
                id="contact-email"
                type="email"
                autoComplete="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              />
            </Field>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("contacts.deleteTitle")}
        description={removing ? `${removing.legalName} (${removing.taxId})` : undefined}
        submitLabel={t("contacts.delete")}
        destructive
        busy={busy}
        onSubmit={removeContact}
      >
        <p className="text-sm text-muted-foreground">{t("contacts.deleteConfirm")}</p>
      </FormDialog>
    </>
  );
}
