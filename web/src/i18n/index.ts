export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  STORAGE_KEY,
  dictFor,
  getLocale,
  interpolate,
  localizeApiMessage,
  monthsFor,
  persistLocale,
  readStoredLocale,
  setLocale,
  subscribeLocale,
  t,
  translate,
  type Locale,
  type MessageKey,
} from "./core";
export type { Dict } from "./types";
export { I18nProvider, useI18n, useT } from "./provider";
