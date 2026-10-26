export type InvitationEmailPayload = {
  toEmail: string;
  workspaceName: string;
  inviterName?: string | null;
  role: "ANALYST" | "VIEWER" | string;
  rawToken: string;
  expiresAt: Date;
};

export type EmailDeliveryResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

type SentEmailRecord = {
  to: string;
  subject: string;
  html: string;
  text: string;
  sentAt: Date;
  inviteLink: string;
};

const sentEmailsOutbox: SentEmailRecord[] = [];

export function getSentEmails(): ReadonlyArray<SentEmailRecord> {
  return [...sentEmailsOutbox];
}

export function clearSentEmails(): void {
  sentEmailsOutbox.length = 0;
}

export function getValidatedBaseUrl(): string {
  const configured = process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
  try {
    const url = new URL(configured);
    return url.origin;
  } catch {
    return "http://localhost:3000";
  }
}

export async function sendWorkspaceInvitationEmail(payload: InvitationEmailPayload): Promise<EmailDeliveryResult> {
  const baseUrl = getValidatedBaseUrl();
  const inviteLink = `${baseUrl}/invite/accept?token=${encodeURIComponent(payload.rawToken)}`;
  const expiresFormatted = payload.expiresAt.toUTCString();

  const inviterContext = payload.inviterName ? `${payload.inviterName} has invited you` : "You have been invited";
  const subject = `Invitation to join ${payload.workspaceName} on LOOP`;

  const text = [
    `${inviterContext} to join the workspace "${payload.workspaceName}" as a ${payload.role}.`,
    "",
    `Accept your invitation: ${inviteLink}`,
    "",
    `This invitation will expire on ${expiresFormatted}.`,
    "",
    "If you did not expect this invitation, please ignore this email.",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f7f5; padding: 24px; color: #17221d;">
  <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border: 1px solid #dce5de; border-radius: 16px; padding: 32px;">
    <h2 style="color: #193c2a; margin-top: 0;">Workspace Invitation</h2>
    <p style="font-size: 15px; line-height: 1.5;">${inviterContext} to join <strong>${payload.workspaceName}</strong> as a <strong>${payload.role}</strong> on LOOP.</p>
    <div style="margin: 28px 0;">
      <a href="${inviteLink}" style="background-color: #193c2a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Accept Invitation</a>
    </div>
    <p style="font-size: 13px; color: #718379;">This invitation link will expire on <strong>${expiresFormatted}</strong>.</p>
    <hr style="border: none; border-top: 1px solid #edf2ee; margin: 24px 0;" />
    <p style="font-size: 12px; color: #8aa092;">If you were not expecting this invitation, you can safely ignore this email.</p>
  </div>
</body>
</html>
  `.trim();

  // If in production without configured credentials, report failure accurately
  const isProduction = process.env.NODE_ENV === "production";
  const hasProvider = Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST || process.env.ENABLE_TEST_EMAIL_MOCK);

  if (isProduction && !hasProvider) {
    console.error("Production email delivery failed: No email provider configured.");
    return {
      success: false,
      error: "Email delivery provider is not configured. Please contact your system administrator.",
    };
  }

  // Development, test, or configured mock mode
  const record: SentEmailRecord = {
    to: payload.toEmail,
    subject,
    html,
    text,
    sentAt: new Date(),
    inviteLink,
  };
  sentEmailsOutbox.push(record);

  return {
    success: true,
    messageId: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
}
