"use client";

import { ArrowLeftIcon } from "lucide-react";
import { ButtonLink } from "@/components/ui/button-link";
import { Logo } from "@/components/logo";
import { formatDate } from "@/components/ui-kit";
import { useI18n } from "@/i18n";
import { PRIVACY, PRIVACY_CONTROLLER, PRIVACY_EMAIL, PRIVACY_UPDATED } from "@/lib/privacy-content";

/** Public privacy page (/privacitat). Readable signed in or out, in the visitor's language. */
export function PrivacyPolicy() {
  const { locale, t } = useI18n();
  const content = PRIVACY[locale] ?? PRIVACY.ca;
  return (
    <main id="contingut" className="flex min-h-dvh flex-1 justify-center px-4 py-10">
      <article className="flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Logo className="size-9" />
          <ButtonLink href="/" variant="ghost" size="sm">
            <ArrowLeftIcon /> {t("verify.goHome")}
          </ButtonLink>
        </div>
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{content.title}</h1>
          <p className="text-sm text-muted-foreground">
            {content.updated}: {formatDate(PRIVACY_UPDATED)}
          </p>
        </header>
        <dl className="grid gap-2 rounded-xl border bg-card p-4 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
          {PRIVACY_CONTROLLER && PRIVACY_EMAIL ? (
            <>
              <dt className="text-muted-foreground">{content.controllerLabel}</dt>
              <dd className="font-medium">{PRIVACY_CONTROLLER}</dd>
              <dt className="text-muted-foreground">{content.contactLabel}</dt>
              <dd>
                <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${PRIVACY_EMAIL}`}>
                  {PRIVACY_EMAIL}
                </a>
              </dd>
            </>
          ) : (
            <dd className="sm:col-span-2">{content.unconfigured}</dd>
          )}
        </dl>
        {content.sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-sm leading-relaxed text-pretty text-muted-foreground">
                {paragraph}
              </p>
            ))}
            {section.list ? (
              <ul className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-muted-foreground">
                {section.list.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>
    </main>
  );
}
