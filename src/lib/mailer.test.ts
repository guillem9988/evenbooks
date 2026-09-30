import { describe, expect, it } from "vitest";
import { sendEmail } from "./mailer.js";

describe("sendEmail", () => {
  it("simulates email dispatch when no RESEND_API_KEY is configured", async () => {
    delete process.env.RESEND_API_KEY;

    const result = await sendEmail({
      to: "client@example.com",
      subject: "Factura F2026-001",
      text: "Adjuntem la vostra factura en format PDF.",
      attachments: [
        {
          filename: "F2026-001.pdf",
          content: Buffer.from("fake-pdf-content"),
          contentType: "application/pdf",
        },
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.simulated).toBe(true);
    expect(result.messageId).toMatch(/^sim_/);
  });
});
