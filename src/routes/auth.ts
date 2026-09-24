import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { checkPassword, hashPassword, openSession, readEmail, readPassword, SESSION_COOKIE, userIdFromRequest } from "../auth/session.js";

export function registerAuthRoutes(app: FastifyInstance, prisma: PrismaClient): void {
  app.post("/auth/register", async (request, reply) => {
    const body = request.body as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
      legalName?: unknown;
      taxId?: unknown;
    };
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
    await openSession(prisma, reply, user.id);
    return reply.code(201).send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      organization: { id: organization.id, legalName: organization.legalName, taxId: organization.taxId },
    });
  });

  app.post("/auth/login", async (request, reply) => {
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
    if (user === null || !(await checkPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    await openSession(prisma, reply, user.id);
    return reply.send(presentUser(user));
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { token } });
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
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
  memberships: Array<{ organization: { id: string; legalName: string; taxId: string } }>;
}) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    organizations: user.memberships.map((membership) => ({
      id: membership.organization.id,
      legalName: membership.organization.legalName,
      taxId: membership.organization.taxId,
    })),
  };
}
