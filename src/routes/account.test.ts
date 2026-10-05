import { afterAll, describe, expect, it, vi } from "vitest";

const sent: Array<{ to: string; text: string }> = [];
vi.mock("../lib/mailer.js", () => ({
  sendEmail: async (options: { to: string; text: string }) => {
    sent.push(options);
    return { ok: true, simulated: true };
  },
}));

const { loadConfig } = await import("../config.js");
const { createDatabase } = await import("../lib/prisma.js");
const { buildServer } = await import("../server.js");
const { openSession, withSession } = await import("../test/session.js");

const config = loadConfig();
const database = createDatabase(config.databaseUrl);
const app = await buildServer(config);

afterAll(async () => {
  await app.close();
  await database.close();
});

const emailOf = async (cookie: string) =>
  ((await withSession(app, cookie)({ method: "GET", url: "/auth/session" })).json() as { email: string }).email;

describe("password reset", () => {
  it("answers the same for unknown addresses, and the emailed link sets a new password and ends old sessions", async () => {
    const session = await openSession(app, "reset");
    const email = await emailOf(session.cookie);

    const unknown = await app.inject({ method: "POST", url: "/auth/forgot-password", payload: { email: "nobody-here@example.com" } });
    expect(unknown.statusCode).toBe(200);
    const before = sent.length;

    expect((await app.inject({ method: "POST", url: "/auth/forgot-password", payload: { email } })).statusCode).toBe(200);
    expect(sent.length).toBe(before + 1);
    const token = decodeURIComponent(/\/restableix\?token=([^\s]+)/.exec(sent.at(-1)?.text ?? "")?.[1] ?? "");

    expect((await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token, password: "short" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token, password: "a-brand-new-password" } })).statusCode).toBe(200);
    // Single use, and the session that existed before the reset no longer works.
    expect((await app.inject({ method: "POST", url: "/auth/reset-password", payload: { token, password: "another-password" } })).statusCode).toBe(400);
    expect((await withSession(app, session.cookie)({ method: "GET", url: "/auth/session" })).statusCode).toBe(401);

    expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "correct-horse" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "a-brand-new-password" } })).statusCode).toBe(200);
  });
});

describe("POST /auth/change-password", () => {
  it("needs the current password and signs out the other sessions, not this one", async () => {
    const session = await openSession(app, "change");
    const email = await emailOf(session.cookie);
    const second = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "correct-horse" } });
    const secondCookie = `mi_session=${second.cookies.find((c) => c.name === "mi_session")?.value ?? ""}`;
    const change = withSession(app, session.cookie);

    expect((await app.inject({ method: "POST", url: "/auth/change-password", payload: { currentPassword: "correct-horse", newPassword: "x-new-password" } })).statusCode).toBe(401);
    expect((await change({ method: "POST", url: "/auth/change-password", payload: { currentPassword: "wrong-one", newPassword: "x-new-password" } })).statusCode).toBe(403);
    expect((await change({ method: "POST", url: "/auth/change-password", payload: { currentPassword: "correct-horse", newPassword: "short" } })).statusCode).toBe(400);
    expect((await change({ method: "POST", url: "/auth/change-password", payload: { currentPassword: "correct-horse", newPassword: "x-new-password" } })).statusCode).toBe(200);

    expect((await change({ method: "GET", url: "/auth/session" })).statusCode).toBe(200);
    expect((await withSession(app, secondCookie)({ method: "GET", url: "/auth/session" })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "x-new-password" } })).statusCode).toBe(200);
  });
});

describe("DELETE /auth/account", () => {
  it("needs the password, deletes organizations the person owns alone, and keeps shared ones", async () => {
    const owner = await openSession(app, "erase");
    const other = await openSession(app, "erase-colleague");
    // A second organization, shared with a colleague.
    const shared = await database.prisma.organization.create({
      data: { legalName: "Compartida SL", taxId: "B90000001", memberships: { create: [{ userId: owner.userId }, { userId: other.userId }] } },
    });
    const asOwner = withSession(app, owner.cookie);

    expect((await asOwner({ method: "DELETE", url: "/auth/account", payload: { password: "wrong-password" } })).statusCode).toBe(403);
    const deleted = await asOwner({ method: "DELETE", url: "/auth/account", payload: { password: "correct-horse" } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true, deletedOrganizations: 1 });

    expect(await database.prisma.user.findUnique({ where: { id: owner.userId } })).toBeNull();
    expect(await database.prisma.organization.findUnique({ where: { id: owner.organizationId } })).toBeNull();
    expect(await database.prisma.organization.findUnique({ where: { id: shared.id } })).not.toBeNull();
    expect(await database.prisma.membership.count({ where: { organizationId: shared.id } })).toBe(1);
    expect((await asOwner({ method: "GET", url: "/auth/session" })).statusCode).toBe(401);

    await database.prisma.organization.delete({ where: { id: shared.id } });
  });
});
