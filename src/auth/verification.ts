import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { sendEmail } from "../lib/mailer.js";

const LINK_LIFETIME_MS = 48 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Stores a fresh token for the user (replacing any previous one) and emails the verification link. */
export async function sendVerificationEmail(prisma: PrismaClient, user: { id: string; email: string; displayName: string }, webOrigin: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerificationTokenHash: hashToken(token), emailVerificationExpiresAt: new Date(Date.now() + LINK_LIFETIME_MS) },
  });
  const link = `${webOrigin.replace(/\/+$/, "")}/verifica?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Confirma el teu correu · Confirma tu correo · Confirm your email — MatchInvoice",
    text: [
      `Hola ${user.displayName},`,
      "",
      "Confirma el teu correu per activar la lectura de factures amb IA i l’enviament de correus:",
      "Confirma tu correo para activar la lectura de facturas con IA y el envío de correos:",
      "Confirm your email to enable AI invoice reading and sending emails:",
      "",
      link,
      "",
      "L’enllaç caduca en 48 hores. · El enlace caduca en 48 horas. · The link expires in 48 hours.",
    ].join("\n"),
  });
}

/** Marks the token's owner as verified. Returns false for an unknown, used or expired token. */
export async function confirmVerificationToken(prisma: PrismaClient, token: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { emailVerificationTokenHash: hashToken(token) },
    select: { id: true, emailVerificationExpiresAt: true },
  });
  if (user === null || user.emailVerificationExpiresAt === null || user.emailVerificationExpiresAt.getTime() < Date.now()) {
    return false;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationExpiresAt: null },
  });
  return true;
}

export async function isEmailVerified(prisma: PrismaClient, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } });
  return user?.emailVerifiedAt != null;
}
