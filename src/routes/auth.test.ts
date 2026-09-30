import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerAuthRoutes, verifyGoogleCredential } from "./auth.js";

describe("verifyGoogleCredential", () => {
  it("rejects when tokeninfo endpoint fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error_description: "Invalid Value" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogleCredential("bad-token");
    expect(result).toBeInstanceOf(Error);
    if (result instanceof Error) {
      expect(result.message).toContain("Invalid Value");
    }

    vi.unstubAllGlobals();
  });

  it("rejects when email is unverified", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "12345",
        email: "user@example.com",
        email_verified: "false",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogleCredential("token-unverified");
    expect(result).toBeInstanceOf(Error);
    if (result instanceof Error) {
      expect(result.message).toContain("not verified");
    }

    vi.unstubAllGlobals();
  });

  it("rejects when client ID does not match expected", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "12345",
        aud: "wrong-client-id",
        email: "user@example.com",
        email_verified: "true",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogleCredential("valid-token", "expected-client-id");
    expect(result).toBeInstanceOf(Error);
    if (result instanceof Error) {
      expect(result.message).toContain("mismatch");
    }

    vi.unstubAllGlobals();
  });

  it("parses valid verified payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sub: "google-uid-999",
        aud: "my-app.apps.googleusercontent.com",
        email: "Guillem@Example.COM",
        email_verified: "true",
        name: "Guillem Rovira",
        picture: "https://example.com/avatar.jpg",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyGoogleCredential("good-token", "my-app.apps.googleusercontent.com");
    expect(result).not.toBeInstanceOf(Error);
    if (!(result instanceof Error)) {
      expect(result.email).toBe("guillem@example.com");
      expect(result.sub).toBe("google-uid-999");
      expect(result.name).toBe("Guillem Rovira");
      expect(result.picture).toBe("https://example.com/avatar.jpg");
    }

    vi.unstubAllGlobals();
  });
});

describe("Google Auth routes", () => {
  it("returns google auth status from /auth/registration", async () => {
    const app = Fastify();
    await app.register(cookie);

    registerAuthRoutes(
      app,
      {} as any,
      { secure: false, sameSite: "lax", domain: null },
      { allowPublic: true, inviteCode: null },
      { clientId: "google-client-123.apps.googleusercontent.com", clientSecret: "secret-456" },
    );

    const response = await app.inject({
      method: "GET",
      url: "/auth/registration",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.googleAuthEnabled).toBe(true);
    expect(body.googleClientId).toBe("google-client-123.apps.googleusercontent.com");
  });

  it("redirects to Google OAuth with state cookie on GET /auth/google", async () => {
    const app = Fastify();
    await app.register(cookie);

    registerAuthRoutes(
      app,
      {} as any,
      { secure: false, sameSite: "lax", domain: null },
      { allowPublic: true, inviteCode: null },
      { clientId: "google-client-123.apps.googleusercontent.com", clientSecret: "secret-456" },
    );

    const response = await app.inject({
      method: "GET",
      url: "/auth/google?redirect=/factures",
    });

    expect(response.statusCode).toBe(302);
    const location = response.headers.location;
    expect(location).toContain("accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain("client_id=google-client-123.apps.googleusercontent.com");
    expect(location).toContain("response_type=code");

    const cookies = response.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const stateCookie = Array.isArray(cookies) ? cookies.find((c) => c.startsWith("mi_oauth_state=")) : cookies;
    expect(stateCookie).toBeDefined();
  });
});
