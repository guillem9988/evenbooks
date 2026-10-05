"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2Icon, MailCheckIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Logo } from "@/components/logo";
import { useOrganization } from "@/components/organization";
import { notifyError, notifySuccess } from "@/components/ui-kit";
import { useT } from "@/i18n";
import { api } from "@/lib/api";

/** Banner shown inside the app until the person confirms their email address. */
export function VerifyEmailBanner() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="flex items-start gap-2.5">
        <MailCheckIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {t("verify.banner")}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start sm:self-auto"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api("/auth/resend-verification", { method: "POST" });
            notifySuccess(t("verify.resent"));
          } catch (cause) {
            notifyError(cause, t("verify.resendFailed"));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("common.wait") : t("verify.resend")}
      </Button>
    </div>
  );
}

/** Full-page screen for the link in the verification email (/verifica?token=…). Works signed in or out. */
export function VerifyEmailScreen() {
  const t = useT();
  const { refresh } = useOrganization();
  const [status, setStatus] = useState<"checking" | "ok" | "failed">("checking");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get("token") ?? "";
    // Keep the token out of the address bar (and so out of history and screenshots).
    window.history.replaceState(null, "", window.location.pathname);
    api("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }).then(
      async () => {
        setStatus("ok");
        await refresh();
      },
      () => setStatus("failed"),
    );
  }, [refresh]);

  const Icon = status === "ok" ? CheckCircle2Icon : status === "failed" ? XCircleIcon : MailCheckIcon;
  const title = status === "ok" ? t("verify.success") : status === "failed" ? t("verify.failed") : t("verify.checking");
  const hint = status === "ok" ? t("verify.successHint") : status === "failed" ? t("verify.failedHint") : null;

  return (
    <main id="contingut" className="flex min-h-dvh flex-1 items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
        <Logo className="size-11" />
        <Icon
          className={
            status === "ok"
              ? "size-8 text-emerald-600 dark:text-emerald-400"
              : status === "failed"
                ? "size-8 text-red-600 dark:text-red-400"
                : "size-8 animate-pulse text-muted-foreground"
          }
          aria-hidden
        />
        <div className="flex flex-col gap-1" role="status">
          <h1 className="text-lg font-semibold">{title}</h1>
          {hint ? <p className="text-sm text-pretty text-muted-foreground">{hint}</p> : null}
        </div>
        {status !== "checking" ? <ButtonLink href="/">{t("verify.goHome")}</ButtonLink> : null}
      </div>
    </main>
  );
}
