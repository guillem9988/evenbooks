export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
export const ORG_KEY = "matchinvoice-organization-id";

export function apiPath(path: string): string {
  if (API_URL !== "") {
    return `${API_URL}${path}`;
  }
  return `/backend${path}`;
}

const MESSAGES: Record<string, string> = {
  "Invalid email or password": "El correu o la contrasenya no són correctes.",
  "Email is already registered": "Aquest correu ja té un compte. Entra-hi.",
  "Login required": "La sessió ha caducat. Torna a entrar.",
  "Not a member of this organization": "No tens accés a aquesta organització.",
  "Organization not found": "No s’ha trobat l’organització.",
  "Transaction or invoice is already matched": "Aquest moviment o factura ja està conciliat.",
  "password must be 8 to 200 characters": "La contrasenya ha de tenir entre 8 i 200 caràcters.",
  "email is required": "Escriu un correu vàlid.",
  "Invoice is already rectified": "Aquesta factura ja té una rectificativa.",
  "Cannot rectify a credit note": "Una rectificativa no es pot rectificar.",
  "Contact not found": "No s’ha trobat el client.",
  "Catalog item not found": "Aquest producte ja no existeix.",
};

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
    throw new ApiError("No hi ha connexió amb el servidor. Comprova la xarxa i torna-ho a provar.", 0);
  }
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const raw = body.error ?? "";
    throw new ApiError(MESSAGES[raw] ?? (raw || "La petició ha fallat"), response.status);
  }
  return body;
}
