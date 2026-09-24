export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";
export const ORG_KEY = "matchinvoice-organization-id";

export function apiPath(path: string): string {
  if (API_URL !== "") {
    return `${API_URL}${path}`;
  }
  return `/backend${path}`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiPath(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "La petició ha fallat");
  }
  return body;
}
