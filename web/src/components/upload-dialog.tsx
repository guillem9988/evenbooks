"use client";

import { useId, useState } from "react";
import { FileIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, notifyError } from "@/components/ui-kit";

const MAX_BYTES = 10 * 1024 * 1024;

export function UploadDialog({
  open,
  onOpenChange,
  title,
  description,
  accept,
  extensions,
  multiple,
  submitLabel,
  onUpload,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  accept: string;
  extensions: string[];
  multiple?: boolean;
  submitLabel: (count: number) => string;
  onUpload: (files: File[]) => Promise<void>;
}) {
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function pick(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const wrong = picked.find((file) => !extensions.some((extension) => file.name.toLowerCase().endsWith(extension)));
    const large = picked.find((file) => file.size > MAX_BYTES);
    if (wrong) {
      setError(`${wrong.name} no és un format acceptat (${extensions.join(", ")}).`);
    } else if (large) {
      setError(`${large.name} fa més de 10 MB.`);
    } else if (multiple && picked.length > 20) {
      setError("Com a màxim 20 fitxers cada cop.");
    } else {
      setError(null);
    }
    setFiles(picked);
  }

  async function submit() {
    if (files.length === 0) {
      setError("Tria almenys un fitxer.");
      return;
    }
    if (error) return;
    setBusy(true);
    try {
      await onUpload(files);
      setFiles([]);
      onOpenChange(false);
    } catch (cause) {
      notifyError(cause, "No s’ha pogut pujar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setFiles([]);
          setError(null);
        }
        onOpenChange(next);
      }}
      title={title}
      description={description}
      submitLabel={submitLabel(files.length)}
      busy={busy}
      onSubmit={submit}
    >
      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/40 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
      >
        <FileIcon className="size-6 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{multiple ? "Tria els fitxers" : "Tria el fitxer"}</span>
        <span className="text-xs text-muted-foreground">
          {extensions.join(", ")} · fins a 10 MB{multiple ? " cadascun" : ""}
        </span>
        <input
          id={inputId}
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(event) => pick(event.target.files)}
        />
      </label>
      {files.length > 0 ? (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1">
              <span className="truncate">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Treu ${file.name}`}
                onClick={() => {
                  const rest = files.filter((_, position) => position !== index);
                  setFiles(rest);
                  if (rest.length === 0) setError(null);
                }}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={`${inputId}-error`} className="text-sm font-medium text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </FormDialog>
  );
}
