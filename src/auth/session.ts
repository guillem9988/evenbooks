import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { CookieConfig } from "../config.js";

export const SESSION_COOKIE = "mi_session";
const WEEK = 7 * 24 * 60 * 60 * 1000;

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function checkPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function readPassword(value: unknown): string | Error {
  if (typeof value !== "string" || value.length < 8 || value.length > 200) {
    return new Error("password must be 8 to 200 characters");
  }
  return value;
}

export function readEmail(value: unknown): string | Error {
  if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    return new Error("email is required");
  }
  return value.trim().toLowerCase().slice(0, 255);
}

export const LOCAL_COOKIE: CookieConfig = { secure: false, sameSite: "lax", domain: null };

/** Attributes shared by setCookie and clearCookie; the browser only clears a cookie when they match. */
export function sessionCookieAttributes(cookie: CookieConfig) {
  return {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
    path: "/",
    ...(cookie.domain ? { domain: cookie.domain } : {}),
  };
}

export async function openSession(prisma: PrismaClient, reply: FastifyReply, userId: string, cookie: CookieConfig = LOCAL_COOKIE): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + 4 * WEEK) },
  });
  reply.setCookie(SESSION_COOKIE, token, {
    ...sessionCookieAttributes(cookie),
    maxAge: 4 * 7 * 24 * 60 * 60,
  });
}

export async function userIdFromRequest(prisma: PrismaClient, request: FastifyRequest): Promise<string | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) {
    return null;
  }
  const session = await prisma.session.findUnique({ where: { token } });
  if (session === null || session.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return session.userId;
}
