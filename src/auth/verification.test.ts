import { afterAll, describe, expect, it, vi } from "vitest";

const sent: Array<{ to: string; text: string }> = [];
vi.mock("../lib/mailer.js", () => ({
  sendEmail: async (options: { to: string; text: string }) => {
    sent.push(options);
    return { ok: true, simulated: true };
  },
}));

const { loadConfig } = await import("../config.js");
const { buildServer } = await import("../server.js");
const { openSession, withSession } = await import("../test/session.js");

const app = await buildServer(loadConfig({ ...process.env, EMAIL_VERIFICATION: "required" }));
const session = await openSession(app, "verify");
const inject = withSession(app, session.cookie);

afterAll(async () => {
  await app.close();
});

const tokenFromLastEmail = () => {
  const match = /\/verifica\?token=([^\s]+)/.exec(sent.at(-1)?.text ?? "");
  return decodeURIComponent(match?.[1] ?? "");
};

describe("email verification", () => {
  it("emails a link on sign-up and reports the account as unverified", async () => {
    expect(sent.length).toBe(1);
    expect(tokenFromLastEmail().length).toBeGreaterThan(20);
    const me = await inject({ method: "GET", url: "/auth/session" });
    expect((me.json() as { emailVerified: boolean }).emailVerified).toBe(false);
  });

  it("blocks AI uploads until the address is verified", async () => {
    const boundary = "----verify";
    const body = [`--${boundary}`, 'Content-Disposition: form-data; name="files"; filename="f.pdf"', "Content-Type: application/pdf", "", "%PDF-1.4", `--${boundary}--`, ""].join("\r\n");
    const response = await inject({
      method: "POST",
      url: `/organizations/${session.organizationId}/invoices`,
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "Email not verified" });
  });

  it("rejects a bad token, accepts the emailed one once, and the resend becomes a no-op", async () => {
    expect((await app.inject({ method: "POST", url: "/auth/verify-email", payload: { token: "x".repeat(43) } })).statusCode).toBe(400);

    const resend = await inject({ method: "POST", url: "/auth/resend-verification" });
    expect(resend.statusCode).toBe(200);
    expect(sent.length).toBe(2);
    const token = tokenFromLastEmail();

    expect((await app.inject({ method: "POST", url: "/auth/verify-email", payload: { token } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/auth/verify-email", payload: { token } })).statusCode).toBe(400);
    const me = await inject({ method: "GET", url: "/auth/session" });
    expect((me.json() as { emailVerified: boolean }).emailVerified).toBe(true);
    expect((await inject({ method: "POST", url: "/auth/resend-verification" })).json()).toEqual({ ok: true, alreadyVerified: true });
  });
});
