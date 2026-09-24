export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:43123";
export const ORG_KEY = "matchinvoice-organization-id";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
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
