import { getLocale, localizeApiMessage, t } from "@/i18n/core";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const ORG_KEY = "matchinvoice-organization-id";

export function apiPath(path: string): string {
  if (API_URL !== "") {
    return `${API_URL}${path}`;
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
  try {
    response = await fetch(apiPath(path), {
      ...init,
      credentials: "include",
      headers: {
        ...(init?.body instanceof FormData || init?.body === undefined ? {} : { "content-type": "application/json" }),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(t("api.offline"), 0);
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const raw = body.error ?? "";
    throw new ApiError(localizeApiMessage(raw, getLocale()), response.status);
  }
  return body;
}
