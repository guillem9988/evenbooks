"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  dictFor,
  getLocale,
  persistLocale,
  readStoredLocale,
  setLocale as setStoreLocale,
  subscribeLocale,
  translate,
  type Locale,
  type MessageKey,
} from "./core";
import type { Dict } from "./types";

type Params = Record<string, string | number>;

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey | string, params?: Params) => string;
  dict: Dict;
}

const I18nContext = createContext<I18nValue | null>(null);

function useStoreLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => DEFAULT_LOCALE);
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const locale = useStoreLocale();

  useEffect(() => {
    const stored = readStoredLocale();
    setStoreLocale(stored);
    setHydrated(true);
  }, []);

  const changeLocale = useCallback((next: Locale) => {
    setStoreLocale(next);
    persistLocale(next);
  }, []);

  const t = useCallback((key: MessageKey | string, params?: Params) => translate(locale, key, params), [locale]);

  const value = useMemo<I18nValue>(
    () => ({
      locale: hydrated ? locale : DEFAULT_LOCALE,
      setLocale: changeLocale,
      t,
      dict: dictFor(hydrated ? locale : DEFAULT_LOCALE),
    }),
    [changeLocale, hydrated, locale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return value;
}

export function useT(): I18nValue["t"] {
  return useI18n().t;
}
