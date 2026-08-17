export interface MailAttachment {
  url: string;
  filename: string;
  mime: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  attachments: MailAttachment[];
}

export interface SwoshmailApiConfig {
  baseUrl: string;
  apiKey: string;
}

export function getSwoshmailConfig(): SwoshmailApiConfig | null {
  const baseUrl = process.env.SWOSHMAIL_API_URL;
  const apiKey = process.env.SWOSHMAIL_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export async function sendViaSwoshmail(config: SwoshmailApiConfig, input: SendMailInput): Promise<{
  messageId?: string;
  error?: string;
}> {
  const res = await fetch(`${config.baseUrl}/api/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
      source: "swoshboard",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  const data = (await res.json().catch(() => null)) as
    | { messageId?: string; error?: string; success?: boolean }
    | null;

  if (!res.ok) {
    return { error: data?.error || `Swoshmail API returned status ${res.status}` };
  }
  return { messageId: data?.messageId };
}