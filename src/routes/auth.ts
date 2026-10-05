import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import {
  registrationStatus,
  type CookieConfig,
  type EmailVerificationConfig,
  type GoogleOAuthConfig,
  type RegistrationConfig,
} from "../config.js";
import { confirmVerificationToken, resetPasswordWithToken, sendPasswordResetEmail, sendVerificationEmail } from "../auth/verification.js";
import {
  checkPassword,
  hashPassword,
  LOCAL_COOKIE,
  openSession,
  readEmail,
  readPassword,
  SESSION_COOKIE,
  sessionCookieAttributes,
  userIdFromRequest,
} from "../auth/session.js";

function inviteMatches(expected: string, provided: unknown): boolean {
  if (typeof provided !== "string") {
    return false;
  }
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export interface GoogleTokenPayload {
  iss?: string;
  sub?: string;
  aud?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
}

export async function verifyGoogleCredential(
  credential: string,
  expectedClientId: string | null,
): Promise<{ email: string; sub: string; name: string; picture: string | null } | Error> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error_description?: string; error?: string };
      return new Error(err.error_description || err.error || "Invalid Google credential");
    }
    const data = (await res.json()) as GoogleTokenPayload;
    if (!data.email || (data.email_verified !== "true" && data.email_verified !== true)) {
      return new Error("Google email not verified");
    }
    if (!data.sub) {
      return new Error("Invalid Google token: missing sub");
    }
    // The token must have been issued to this app; otherwise any site's Google login could be replayed here.
    if (!expectedClientId || data.aud !== expectedClientId) {
      return new Error("Google token client ID mismatch");
    }
    return {
      email: data.email.trim().toLowerCase(),
      sub: data.sub,
      name: data.name?.trim() || data.email.split("@")[0] || "Usuari",
      picture: data.picture || null,
    };
  } catch (cause) {
    return new Error(`Failed to verify Google token: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

async function findOrCreateGoogleUser(
  prisma: PrismaClient,
  verified: { email: string; sub: string; name: string; picture: string | null },
  registration: RegistrationConfig,
  googleOAuth: GoogleOAuthConfig,
  inviteCode?: unknown,
): Promise<{ user: any; isNew: boolean } | Error> {
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ googleId: verified.sub }, { email: verified.email }],
    },
    include: { memberships: { include: { organization: true } } },
  });

  if (user !== null) {
    // Google has verified this address, so signing in with it also verifies the account.
    if (!user.googleId || !user.avatarUrl || user.emailVerifiedAt === null) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: user.googleId ?? verified.sub,
          avatarUrl: user.avatarUrl ?? verified.picture,
          emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        },
        include: { memberships: { include: { organization: true } } },
      });
    }
    return { user, isNew: false };
  }

  const status = registrationStatus(registration, googleOAuth);
  if (!status.open) {
    return new Error("Registration is disabled");
  }
  if (status.inviteRequired && !inviteMatches(registration.inviteCode!, inviteCode)) {
    return new Error("Invalid invite code");
  }

  const createdUser = await prisma.user.create({
    data: {
      email: verified.email,
      displayName: verified.name.slice(0, 255),
      googleId: verified.sub,
      avatarUrl: verified.picture ? verified.picture.slice(0, 1024) : null,
      passwordHash: null,
      emailVerifiedAt: new Date(),
      memberships: {
        create: {
          organization: {
            create: {
              legalName: verified.name.slice(0, 255) || "La meva organització",
              taxId: "PENDENT",
            },
          },
        },
      },
    },
    include: { memberships: { include: { organization: true } } },
  });

  return { user: createdUser, isNew: true };
}

function resolveCallbackUri(request: FastifyRequest): string {
  const proto = (request.headers["x-forwarded-proto"] as string) || "http";
  const host = (request.headers["x-forwarded-host"] as string) || request.headers.host || "127.0.0.1:43123";
  return `${proto}://${host}/auth/google/callback`;
}

/** Slows down password guessing and sign-up spam: per client IP, on the routes that check credentials. */
const AUTH_RATE_LIMIT = { max: 10, timeWindow: "1 minute" };

export function registerAuthRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  cookie: CookieConfig = LOCAL_COOKIE,
  registration: RegistrationConfig = { allowPublic: true, inviteCode: null },
  googleOAuth: GoogleOAuthConfig = { clientId: null, clientSecret: null },
  webOrigins: string[] = [],
  emailVerification: EmailVerificationConfig = { required: false },
): void {
  const verificationOrigin = webOrigins[0] ?? "http://127.0.0.1:43124";
  const safeRedirect = (target: unknown) => safeRedirectTarget(target, webOrigins);
  app.get("/auth/registration", async (_request, reply) => {
    return reply.send(registrationStatus(registration, googleOAuth));
  });

  app.post("/auth/register", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const status = registrationStatus(registration, googleOAuth);
    if (!status.open) {
      return reply.code(403).send({ error: "Registration is disabled" });
    }
    const body = request.body as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
      legalName?: unknown;
      taxId?: unknown;
      inviteCode?: unknown;
    };
    if (status.inviteRequired && !inviteMatches(registration.inviteCode!, body.inviteCode)) {
      return reply.code(403).send({ error: "Invalid invite code" });
    }
    const email = readEmail(body?.email);
    const password = readPassword(body?.password);
    if (email instanceof Error) {
      return reply.code(400).send({ error: email.message });
    }
    if (password instanceof Error) {
      return reply.code(400).send({ error: password.message });
    }
    if (typeof body.displayName !== "string" || body.displayName.trim() === "") {
      return reply.code(400).send({ error: "displayName is required" });
    }
    if (typeof body.legalName !== "string" || body.legalName.trim() === "") {
      return reply.code(400).send({ error: "legalName is required" });
    }
    if (typeof body.taxId !== "string" || body.taxId.trim() === "") {
      return reply.code(400).send({ error: "taxId is required" });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing !== null) {
      return reply.code(409).send({ error: "Email is already registered" });
    }
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: body.displayName.trim().slice(0, 255),
        emailVerifiedAt: emailVerification.required ? null : new Date(),
        memberships: {
          create: {
            organization: {
              create: {
                legalName: body.legalName.trim().slice(0, 255),
                taxId: body.taxId.trim().slice(0, 50),
              },
            },
          },
        },
      },
      include: { memberships: { include: { organization: true } } },
    });
    const organization = user.memberships[0]?.organization;
    if (organization === undefined) {
      return reply.code(500).send({ error: "Organization was not created" });
    }
    if (emailVerification.required) {
      // A failed send must not fail the sign-up: the person can ask for the link again.
      await sendVerificationEmail(prisma, user, verificationOrigin).catch((error: unknown) => {
        request.log.warn({ err: error }, "could not send the verification email");
      });
    }
    await openSession(prisma, reply, user.id, cookie);
    return reply.code(201).send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: null,
      emailVerified: user.emailVerifiedAt !== null,
      organization: { id: organization.id, legalName: organization.legalName, taxId: organization.taxId },
    });
  });

  app.post("/auth/login", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown };
    const email = readEmail(body?.email);
    const password = readPassword(body?.password);
    if (email instanceof Error || password instanceof Error) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    const user = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { include: { organization: true } } },
    });
    if (user === null || !user.passwordHash || !(await checkPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    await openSession(prisma, reply, user.id, cookie);
    return reply.send(presentUser(user));
  });

  app.post("/auth/google", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    if (!googleOAuth.clientId) {
      return reply.code(400).send({ error: "Google OAuth is not configured on the server" });
    }
    const body = request.body as { credential?: unknown; inviteCode?: unknown };
    if (typeof body?.credential !== "string" || body.credential.trim() === "") {
      return reply.code(400).send({ error: "Google credential is required" });
    }
    const verified = await verifyGoogleCredential(body.credential.trim(), googleOAuth.clientId);
    if (verified instanceof Error) {
      return reply.code(401).send({ error: verified.message });
    }
    const result = await findOrCreateGoogleUser(prisma, verified, registration, googleOAuth, body.inviteCode);
    if (result instanceof Error) {
      const code = result.message === "Invalid invite code" || result.message === "Registration is disabled" ? 403 : 400;
      return reply.code(code).send({ error: result.message });
    }
    await openSession(prisma, reply, result.user.id, cookie);
    return reply.code(result.isNew ? 201 : 200).send(presentUser(result.user));
  });

  app.get("/auth/google", async (request, reply) => {
    if (!googleOAuth.clientId) {
      return reply.code(400).send({
        error: "Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      });
    }
    const query = request.query as { redirect?: string; inviteCode?: string };
    const state = randomBytes(24).toString("hex");
    const statePayload = JSON.stringify({
      state,
      redirect: safeRedirect(query.redirect),
      inviteCode: query.inviteCode || null,
    });
    reply.setCookie("mi_oauth_state", statePayload, {
      ...sessionCookieAttributes(cookie),
      maxAge: 600,
    });

    const callbackUri = resolveCallbackUri(request);
    const params = new URLSearchParams({
      client_id: googleOAuth.clientId,
      redirect_uri: callbackUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get("/auth/google/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    const stateCookie = request.cookies["mi_oauth_state"];
    reply.clearCookie("mi_oauth_state", sessionCookieAttributes(cookie));

    let redirectTarget = "/";
    let inviteCode: string | null = null;
    let expectedState: string | null = null;

    if (stateCookie) {
      try {
        const parsed = JSON.parse(stateCookie);
        expectedState = parsed.state;
        redirectTarget = safeRedirect(parsed.redirect);
        inviteCode = parsed.inviteCode || null;
      } catch {
        // ignore
      }
    }

    if (query.error) {
      return reply.redirect(`${redirectTarget}?auth_error=${encodeURIComponent(query.error)}`);
    }

    if (!query.code || !query.state || query.state !== expectedState) {
      return reply.redirect(`${redirectTarget}?auth_error=${encodeURIComponent("Invalid OAuth state")}`);
    }

    if (!googleOAuth.clientId || !googleOAuth.clientSecret) {
      return reply.redirect(`${redirectTarget}?auth_error=${encodeURIComponent("Google OAuth not configured")}`);
    }

    const callbackUri = resolveCallbackUri(request);

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: googleOAuth.clientId,
          client_secret: googleOAuth.clientSecret,
          redirect_uri: callbackUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const err = (await tokenRes.json().catch(() => ({}))) as { error_description?: string };
        return reply.redirect(`${redirectTarget}?auth_error=${encodeURIComponent(err.error_description || "Token exchange failed")}`);
      }

      const tokenData = (await tokenRes.json()) as { id_token?: string; access_token?: string };
      if (!tokenData.id_token) {
        return reply.redirect(`${redirectTarget}?auth_error=${encodeURIComponent("No id_token returned from Google")}`);
      }

      const verified = await verifyGoogleCredential(tokenData.id_token, googleOAuth.clientId);
      if (verified instanceof Error) {
        return reply.redirect(`${redirectTarget}?auth_error=${encodeURIComponent(verified.message)}`);
      }

      const result = await findOrCreateGoogleUser(prisma, verified, registration, googleOAuth, inviteCode);
      if (result instanceof Error) {
        return reply.redirect(`${redirectTarget}?auth_error=${encodeURIComponent(result.message)}`);
      }

      await openSession(prisma, reply, result.user.id, cookie);
      return reply.redirect(redirectTarget);
    } catch (cause) {
      return reply.redirect(
        `${redirectTarget}?auth_error=${encodeURIComponent(cause instanceof Error ? cause.message : "Authentication failed")}`,
      );
    }
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    reply.clearCookie(SESSION_COOKIE, sessionCookieAttributes(cookie));
    return reply.code(204).send();
  });

  app.post("/auth/verify-email", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const token = (request.body as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || token.length < 20 || token.length > 200) {
      return reply.code(400).send({ error: "Invalid or expired verification link" });
    }
    if (!(await confirmVerificationToken(prisma, token))) {
      return reply.code(400).send({ error: "Invalid or expired verification link" });
    }
    return reply.send({ ok: true });
  });

  app.post("/auth/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }, async (request, reply) => {
    const email = readEmail((request.body as { email?: unknown } | undefined)?.email);
    if (email instanceof Error) {
      return reply.code(400).send({ error: email.message });
    }
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, displayName: true } });
    if (user !== null) {
      await sendPasswordResetEmail(prisma, user, verificationOrigin).catch((error: unknown) => {
        request.log.warn({ err: error }, "could not send the password reset email");
      });
    }
    // Same answer whether or not the address has an account, so this can't be used to probe for users.
    return reply.send({ ok: true });
  });

  app.post("/auth/reset-password", { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const body = (request.body as { token?: unknown; password?: unknown } | undefined) ?? {};
    const password = readPassword(body.password);
    if (password instanceof Error) {
      return reply.code(400).send({ error: password.message });
    }
    if (typeof body.token !== "string" || body.token.length < 20 || body.token.length > 200) {
      return reply.code(400).send({ error: "Invalid or expired reset link" });
    }
    if (!(await resetPasswordWithToken(prisma, body.token, await hashPassword(password)))) {
      return reply.code(400).send({ error: "Invalid or expired reset link" });
    }
    return reply.send({ ok: true });
  });

  app.post("/auth/resend-verification", { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (request, reply) => {
    const userId = await userIdFromRequest(prisma, request);
    if (userId === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, displayName: true, emailVerifiedAt: true } });
    if (user === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    if (user.emailVerifiedAt !== null) {
      return reply.send({ ok: true, alreadyVerified: true });
    }
    await sendVerificationEmail(prisma, user, verificationOrigin);
    return reply.send({ ok: true });
  });

  app.get("/auth/session", async (request, reply) => {
    const userId = await userIdFromRequest(prisma, request);
    if (userId === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { organization: true } } },
    });
    if (user === null) {
      return reply.code(401).send({ error: "Login required" });
    }
    return reply.send(presentUser(user));
  });
}

function presentUser(user: {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  emailVerifiedAt?: Date | null;
  passwordHash?: string | null;
  memberships: Array<{ organization: { id: string; legalName: string; taxId: string } }>;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: user.emailVerifiedAt != null,
    hasPassword: Boolean(user.passwordHash),
    organizations: user.memberships.map((membership) => ({
      id: membership.organization.id,
      legalName: membership.organization.legalName,
      taxId: membership.organization.taxId,
    })),
  };
}

/**
 * Where the OAuth flow may send the browser back to: a same-site path, or a URL on one of the
 * configured web origins. Anything else becomes "/", so the login can't be used as an open redirect.
 */
export function safeRedirectTarget(target: unknown, webOrigins: string[]): string {
  if (typeof target !== "string" || target === "") return "/";
  if (target.startsWith("/") && !target.startsWith("//") && !target.startsWith("/\\")) return target;
  try {
    const url = new URL(target);
    return webOrigins.includes(url.origin) ? url.toString() : "/";
  } catch {
    return "/";
  }
}
