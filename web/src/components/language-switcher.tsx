"use client";

import { LOCALE_LABELS, LOCALES, type Locale } from "@/i18n/core";
import { useI18n } from "@/i18n";
import { NativeSelect } from "@/components/ui-kit";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <NativeSelect
      aria-label={t("common.language")}
      className={className ?? "h-8 w-auto min-w-0 text-xs"}
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
    >
      {LOCALES.map((code) => (
        <option key={code} value={code}>
          {LOCALE_LABELS[code]}
        </option>
      ))}
    </NativeSelect>
  );
}
