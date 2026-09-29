import { getLocale, localizeApiMessage, t } from "@/i18n/core";

export const CUSTOM_API_URL_KEY = "matchinvoice-custom-api-url";
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const ORG_KEY = "matchinvoice-organization-id";

export function getCustomApiUrl(): string | null {
  if (typeof window !== "undefined") {
    const val = window.localStorage.getItem(CUSTOM_API_URL_KEY);
    if (val && val.trim() !== "") {
      return val.trim().replace(/\/+$/, "");
    }
  }
  return null;
}

export function setCustomApiUrl(url: string | null): void {
  if (typeof window !== "undefined") {
    if (url && url.trim() !== "") {
      window.localStorage.setItem(CUSTOM_API_URL_KEY, url.trim().replace(/\/+$/, ""));
    } else {
      window.localStorage.removeItem(CUSTOM_API_URL_KEY);
    }
  }
}

export function getEffectiveApiUrl(): string {
  const custom = getCustomApiUrl();
  if (custom !== null) {
    return custom;
  }
  return API_URL;
}

export function apiPath(path: string): string {
  const base = getEffectiveApiUrl();
  if (base !== "") {
    return `${base}${path}`;
  }
  return `/backend${path}`;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  const signal = init?.signal ?? controller.signal;

  try {
    response = await fetch(apiPath(path), {
      ...init,
      signal,
      credentials: "include",
      headers: {
        ...(init?.body instanceof FormData || init?.body === undefined ? {} : { "content-type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(t("api.offline"), 0);
  } finally {
    clearTimeout(timeoutId);
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const raw = body.error ?? "";
    throw new ApiError(localizeApiMessage(raw, getLocale()), response.status);
  }
  return body;
}
