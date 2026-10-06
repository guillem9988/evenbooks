import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { sendEmail } from "../lib/mailer.js";

const LINK_LIFETIME_MS = 48 * 60 * 60 * 1000;
const RESET_LIFETIME_MS = 60 * 60 * 1000;

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
    subject: "Confirma el teu correu · Confirma tu correo · Confirm your email — Evenbooks",
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

/** Emails a one-hour password-reset link, replacing any earlier one. */
export async function sendPasswordResetEmail(prisma: PrismaClient, user: { id: string; email: string; displayName: string }, webOrigin: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: new Date(Date.now() + RESET_LIFETIME_MS) },
  });
  const link = `${webOrigin.replace(/\/+$/, "")}/restableix?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to: user.email,
    subject: "Restableix la contrasenya · Restablece la contraseña · Reset your password — Evenbooks",
    text: [
      `Hola ${user.displayName},`,
      "",
      "Per triar una contrasenya nova, obre aquest enllaç:",
      "Para elegir una contraseña nueva, abre este enlace:",
      "To choose a new password, open this link:",
      "",
      link,
      "",
      "L’enllaç caduca en 1 hora. Si no ho has demanat tu, ignora aquest correu.",
      "El enlace caduca en 1 hora. Si no lo has pedido tú, ignora este correo.",
      "The link expires in 1 hour. If you didn't ask for it, ignore this email.",
    ].join("\n"),
  });
}

/**
 * Sets a new password for the token's owner and signs out every existing session. Opening the link
 * also proves the address, so the account becomes verified. Returns false for a bad or expired token.
 */
export async function resetPasswordWithToken(prisma: PrismaClient, token: string, passwordHash: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { passwordResetTokenHash: hashToken(token) },
    select: { id: true, passwordResetExpiresAt: true, emailVerifiedAt: true },
  });
  if (user === null || user.passwordResetExpiresAt === null || user.passwordResetExpiresAt.getTime() < Date.now()) {
    return false;
  }
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  return true;
}
