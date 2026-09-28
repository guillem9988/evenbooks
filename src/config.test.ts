import { describe, expect, it } from "vitest";
import { loadConfig, readWebOrigins, registrationStatus, resolveDatabaseSsl } from "./config.js";
import { sessionCookieAttributes } from "./auth/session.js";
import { poolConfig } from "./lib/prisma.js";
import { bullmqConnection } from "./lib/queue.js";

const SUPABASE_URL = "postgresql://postgres.abcd:secret@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require";

const PRODUCTION = {
  NODE_ENV: "production",
  DATABASE_URL: SUPABASE_URL,
  REDIS_URL: "rediss://default:token@eu1-example.upstash.io:6379",
  WEB_ORIGIN: "https://matchinvoice.vercel.app/",
};

describe("loadConfig", () => {
  it("keeps the local Compose defaults outside production", () => {
    const config = loadConfig({});
    expect(config.database.ssl).toBe("disable");
    expect(config.cookie).toEqual({ secure: false, sameSite: "lax", domain: null });
    expect(config.webOrigins).toContain("http://127.0.0.1:43124");
    expect(config.s3.endpoint).toBe("http://localhost:59000");
    expect(config.s3.forcePathStyle).toBe(true);
    expect(config.trustProxy).toBe(false);
    expect(config.registration).toEqual({ allowPublic: true, inviteCode: null });
  });

  it("uses cross-site secure cookies, TLS, and only the web origin in production", () => {
    const config = loadConfig(PRODUCTION);
    expect(config.cookie).toEqual({ secure: true, sameSite: "none", domain: null });
    expect(config.webOrigins).toEqual(["https://matchinvoice.vercel.app"]);
    expect(config.database.ssl).toBe("no-verify");
    expect(config.trustProxy).toBe(true);
    expect(config.registration).toEqual({ allowPublic: false, inviteCode: null });
  });

  it("refuses to boot in production without WEB_ORIGIN", () => {
    expect(() => loadConfig({ ...PRODUCTION, WEB_ORIGIN: "" })).toThrow(/WEB_ORIGIN/);
  });

  it("rejects SameSite=None without Secure", () => {
    expect(() => loadConfig({ COOKIE_SAME_SITE: "none", COOKIE_SECURE: "false" })).toThrow(/COOKIE_SECURE/);
  });

  it("verifies the Postgres certificate when a CA is given", () => {
    const config = loadConfig({ ...PRODUCTION, DATABASE_CA_CERT: "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----" });
    expect(config.database.ssl).toBe("verify");
    expect(config.database.caCert).toContain("\nabc\n");
  });

  it("keeps registration invite-only when public sign-up is off and an invite is set", () => {
    const config = loadConfig({
      ...PRODUCTION,
      ALLOW_PUBLIC_REGISTRATION: "false",
      REGISTRATION_INVITE_CODE: "invite-secret",
    });
    expect(config.registration).toEqual({ allowPublic: false, inviteCode: "invite-secret" });
    expect(registrationStatus(config.registration)).toEqual({ open: true, inviteRequired: true });
  });
});

describe("registrationStatus", () => {
  it("closes sign-up unless public or invite is configured", () => {
    expect(registrationStatus({ allowPublic: true, inviteCode: null })).toEqual({ open: true, inviteRequired: false });
    expect(registrationStatus({ allowPublic: false, inviteCode: "x" })).toEqual({ open: true, inviteRequired: true });
    expect(registrationStatus({ allowPublic: false, inviteCode: null })).toEqual({ open: false, inviteRequired: false });
  });
});

describe("resolveDatabaseSsl", () => {
  it("follows sslmode and explicit overrides", () => {
    expect(resolveDatabaseSsl("postgresql://u:p@localhost:5432/db", null, false, false)).toBe("disable");
    expect(resolveDatabaseSsl("postgresql://u:p@db.example.com/db?sslmode=verify-full", null, false, false)).toBe("verify");
    expect(resolveDatabaseSsl("postgresql://u:p@db.example.com/db", null, true, false)).toBe("no-verify");
    expect(resolveDatabaseSsl(SUPABASE_URL, "disable", true, false)).toBe("disable");
    expect(() => resolveDatabaseSsl(SUPABASE_URL, "maybe", true, false)).toThrow(/DATABASE_SSL/);
  });
});

describe("poolConfig", () => {
  it("moves TLS out of the URL so node-postgres honours the ssl option", () => {
    const config = poolConfig(SUPABASE_URL, { ssl: "no-verify", caCert: null, poolMax: 5 });
    expect(config.connectionString).not.toContain("sslmode");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.max).toBe(5);
  });

  it("leaves local connections without TLS", () => {
    const config = poolConfig("postgresql://matchinvoice:matchinvoice@localhost:54329/matchinvoice");
    expect(config.ssl).toBeUndefined();
  });
});

describe("readWebOrigins", () => {
  it("accepts a comma-separated list and rejects paths", () => {
    expect(readWebOrigins("https://a.example.com, https://b.example.com/", true)).toEqual(["https://a.example.com", "https://b.example.com"]);
    expect(() => readWebOrigins("https://a.example.com/app", true)).toThrow(/origin/);
  });
});

describe("bullmqConnection", () => {
  it("turns on TLS for rediss:// URLs", () => {
    expect(bullmqConnection("rediss://default:tok%40en@eu1-example.upstash.io:6379")).toEqual({
      host: "eu1-example.upstash.io",
      port: 6379,
      username: "default",
      password: "tok@en",
      tls: { servername: "eu1-example.upstash.io" },
      maxRetriesPerRequest: null,
    });
  });

  it("keeps plain redis:// for local Compose", () => {
    expect(bullmqConnection("redis://localhost:63799")).toEqual({ host: "localhost", port: 63799, maxRetriesPerRequest: null });
  });
});

describe("sessionCookieAttributes", () => {
  it("marks the production cookie Secure and SameSite=None", () => {
    expect(sessionCookieAttributes({ secure: true, sameSite: "none", domain: null })).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: "/",
    });
  });
});
