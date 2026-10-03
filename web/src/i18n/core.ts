import { ca } from "./ca";
import { en } from "./en";
import { es } from "./es";
import { DEFAULT_LOCALE, LOCALES, STORAGE_KEY, type Locale } from "./types";
import type { Dict } from "./types";

export { LOCALE_LABELS, LOCALES, DEFAULT_LOCALE, STORAGE_KEY, type Locale } from "./types";
export type { Dict } from "./types";

const DICTS: Record<Locale, Dict> = { ca, es, en };

const API_KEYS: Record<string, keyof Dict["api"]> = {
  "Invalid email or password": "invalidCredentials",
  "Email is already registered": "emailTaken",
  "Login required": "loginRequired",
  "Registration is disabled": "registrationDisabled",
  "Invalid invite code": "invalidInvite",
  "Not a member of this organization": "notMember",
  "Organization not found": "orgNotFound",
  "Transaction or invoice is already matched": "alreadyMatched",
  "password must be 8 to 200 characters": "passwordLength",
  "email is required": "emailRequired",
  "Invoice is already rectified": "alreadyRectified",
  "Cannot rectify a credit note": "cannotRectifyCredit",
  "Contact not found": "contactNotFound",
  "Catalog item not found": "catalogNotFound",
  "Cannot delete contact with existing invoices or quotes": "contactHasRelations",
};

type Params = Record<string, string | number>;

type LeafPaths<T, P extends string = ""> = T extends string
  ? P
  : T extends readonly string[]
    ? never
    : {
        [K in keyof T & string]: LeafPaths<T[K], P extends "" ? K : `${P}.${K}`>;
      }[keyof T & string];

export type MessageKey = LeafPaths<Dict>;

let currentLocale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function readStoredLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (LOCALES as readonly string[]).includes(raw)) return raw as Locale;
  } catch {
    // ignore
  }
  return DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore
  }
}

function getByPath(dict: Dict, path: string): string | undefined {
  const parts = path.split(".");
  let node: unknown = dict;
  for (const part of parts) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => (params[key] !== undefined ? String(params[key]) : `{${key}}`));
}

export function translate(locale: Locale, key: MessageKey | string, params?: Params): string {
  const dict = DICTS[locale] ?? DICTS.ca;
  const value = getByPath(dict, key) ?? getByPath(DICTS.ca, key) ?? key;
  return interpolate(value, params);
}

export function t(key: MessageKey | string, params?: Params): string {
  return translate(currentLocale, key, params);
}

export function dictFor(locale: Locale = currentLocale): Dict {
  return DICTS[locale] ?? DICTS.ca;
}

export function localizeApiMessage(raw: string, locale: Locale = currentLocale): string {
  const key = API_KEYS[raw];
  if (key) return translate(locale, `api.${key}`);
  if (!raw) return translate(locale, "api.failed");
  return raw;
}

export function monthsFor(locale: Locale = currentLocale): Dict["period"]["months"] {
  return dictFor(locale).period.months;
}
