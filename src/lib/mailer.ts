export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SendEmailOptions {
  to: string;
  from?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export interface SendEmailResult {
  ok: boolean;
  simulated?: boolean;
  messageId?: string;
  error?: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const defaultFrom = process.env.EMAIL_FROM?.trim() || "MatchInvoice <factures@matchinvoice.com>";

  if (resendApiKey) {
    try {
      const payload: Record<string, unknown> = {
        from: options.from || defaultFrom,
        to: [options.to],
        subject: options.subject,
        text: options.text,
      };

      if (options.html) {
        payload.html = options.html;
      }

      if (options.attachments && options.attachments.length > 0) {
        payload.attachments = options.attachments.map((att) => ({
          filename: att.filename,
          content: att.content.toString("base64"),
        }));
      }

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Resend error (${response.status}): ${errText}`);
      }

      const data = (await response.json()) as { id?: string };
      return { ok: true, simulated: false, messageId: data.id };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Error enviant el correu mitjançant Resend.";
      throw new Error(message);
    }
  }

  // Graceful simulation when no email provider is configured in environment
  console.info(`[MAILER SIMULATION] To: ${options.to} | Subject: "${options.subject}" | Attachments: ${options.attachments?.map((a) => a.filename).join(", ") ?? "none"}`);
  return {
    ok: true,
    simulated: true,
    messageId: `sim_${Date.now()}`,
  };
}
