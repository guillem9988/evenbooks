import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { buildServer } from "../server.js";
import { openSession, withSession } from "../test/session.js";

const app = await buildServer(loadConfig());
const victim = await openSession(app, "guard-victim");
const intruder = await openSession(app, "guard-intruder");
const asIntruder = withSession(app, intruder.cookie);

afterAll(async () => {
  await app.close();
});

/** Percent-encodes the first character of `text`, which the router decodes back. */
const encodeFirst = (text: string) => `%${text.charCodeAt(0).toString(16)}${text.slice(1)}`;

describe("organization guard", () => {
  it("requires a session even when the path is percent-encoded", async () => {
    for (const url of [`/organizations/${victim.organizationId}/expenses`, `/${encodeFirst("organizations")}/${victim.organizationId}/expenses`]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode, url).toBe(401);
    }
  });

  it("checks membership even when the organization id is percent-encoded", async () => {
    for (const url of [
      `/organizations/${victim.organizationId}/expenses`,
      `/organizations/${encodeFirst(victim.organizationId)}/expenses`,
      `/${encodeFirst("organizations")}/${encodeFirst(victim.organizationId)}/dashboard?from=2026-01-01&to=2026-12-31`,
    ]) {
      const response = await asIntruder({ method: "GET", url });
      expect(response.statusCode, url).toBe(403);
    }
  });

  it("still lets members in and rejects ids that are not UUIDs", async () => {
    const asVictim = withSession(app, victim.cookie);
    expect((await asVictim({ method: "GET", url: `/organizations/${victim.organizationId}/expenses` })).statusCode).toBe(200);
    expect((await asVictim({ method: "GET", url: "/organizations/not-a-uuid/expenses" })).statusCode).toBe(400);
  });
});

describe("authentication hardening", () => {
  it("rate-limits password guessing on /auth/login", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        remoteAddress: "203.0.113.7",
        payload: { email: "nobody@example.com", password: "wrong-password" },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it("sends basic security headers", async () => {
    const response = await app.inject({ method: "GET", url: "/health/live" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
  });
});
