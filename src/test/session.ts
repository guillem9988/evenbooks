import type { FastifyInstance, InjectOptions } from "fastify";

export async function openSession(app: FastifyInstance, label: string): Promise<{ cookie: string; organizationId: string; userId: string }> {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await app.inject({
    method: "POST",
    url: "/auth/register",
    payload: {
      email: `${label}-${stamp}@example.com`,
      password: "correct-horse",
      displayName: label,
      legalName: `${label} SL`,
      taxId: `B${stamp.replace(/\D/g, "").slice(0, 8) || "1"}`,
    },
  });
  if (response.statusCode !== 201) {
    throw new Error(`register failed: ${response.body}`);
  }
  const setCookie = response.headers["set-cookie"];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  const cookie = raw?.split(";")[0];
  if (!cookie) {
    throw new Error("register did not set a session cookie");
  }
  const body = response.json() as { id: string; organization: { id: string } };
  return { cookie, organizationId: body.organization.id, userId: body.id };
}

export function withSession(app: FastifyInstance, cookie: string) {
  return (options: InjectOptions) =>
    app.inject({
      ...options,
      headers: { ...options.headers, cookie },
    });
}
