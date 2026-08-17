# Swoshmail Mail API — contract

Swoshboard does **not** send email itself. All mail goes through the external **Swoshmail** service, which owns the SMTP/Nodemailer setup (Gmail or any host). This document is the contract the Swoshmail owner must implement. Swoshboard is the only client that calls it.

## Endpoint

```
POST {SWOSHMAIL_API_URL}/api/send
Authorization: Bearer {SWOSHMAIL_API_KEY}
Content-Type: application/json
```

`SWOSHMAIL_API_URL` and `SWOSHMAIL_API_KEY` must match what Swoshboard has in its `.env`.

## Request body

```jsonc
{
  "to": "recipient@example.com",          // required, single recipient
  "subject": "Backup files from Swoshboard",
  "text": "Notes body of the mail",
  "attachments": [                        // optional, max 8; zero = plain text mail
    {
      "url": "https://res.cloudinary.com/<cloud>/raw/upload/...sig.../swoshboard/...",
      "filename": "backup.zip",
      "mime": "application/zip"
    }
  ],
  "source": "swoshboard"                  // fixed value; anything else → 403
}
```

- `attachments[].url` are **Cloudinary signed URLs** (short-lived, `authenticated` resources). Swoshmail should `fetch()` each URL server-side and attach the bytes as `filename`. If a fetch fails, return an error and send nothing.
- The signed URLs expire, so Swoshmail must download them promptly (within minutes of the request).

## Success response

```jsonc
// 200
{ "success": true, "messageId": "<id-from-smtp-transport>" }
```

## Error responses

```jsonc
// 401 — missing/invalid API key
{ "error": "Unauthorized" }

// 400 — validation failed
{ "error": "to is required" }

// 502 — SMTP or attachment fetch failed, mail NOT sent
{ "error": "SMTP error: <detail>" }

// 503 — SMTP not configured on the Swoshmail side
{ "error": "Mail service is not configured" }
```

Rules:

- Any non-2xx response → Swoshboard surfaces `error` to the user and sends nothing else.
- `messageId` must be present on success; it is shown in the user's confirmation toast.

## Suggested Swoshmail implementation (Nodemailer)

The old Swoshmail app already shipped Nodemailer — the service behind this API is essentially that logic moved to a standalone server:

```ts
import { createTransport } from "nodemailer";

// SMTP env: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (default 465),
// EMAIL_USER, EMAIL_PASS (Gmail App Password), EMAIL_TO fallback.

const secure = Number(process.env.SMTP_PORT || 465) === 465;
const transport = createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 465),
  secure,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

export async function handleSend(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.SWOSHMAIL_API_KEY}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { to, subject, text, attachments, source } = await req.json();
  if (source !== "swoshboard") return Response.json({ error: "Forbidden" }, { status: 403 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || ""))) {
    return Response.json({ error: "to is required" }, { status: 400 });
  }

  const fetched = [];
  for (const att of attachments || []) {
    const res = await fetch(att.url);
    if (!res.ok) {
      return Response.json({ error: `Attachment fetch failed: ${att.filename}` }, { status: 502 });
    }
    fetched.push({ filename: att.filename, content: Buffer.from(await res.arrayBuffer()) });
  }

  try {
    const info = await transport.sendMail({
      from: `"Swoshmail" <${process.env.EMAIL_USER}>`,
      to,
      subject: subject || "Email Backup",
      text: text || "",
      attachments: fetched,
    });
    return Response.json({ success: true, messageId: info.messageId });
  } catch (error) {
    return Response.json({ error: `SMTP error: ${(error as Error).message}` }, { status: 502 });
  }
}
```

## Where does Swoshboard call it from?

- UI: "Quick Mail" panel in the dashboard (`src/app/dashboard/dashboard-client.tsx`).
- Server: `src/app/api/mail/send/route.ts` → `src/lib/mail.ts` (this is the only mail code in Swoshboard; keep it that way).

## Timeouts & limits Swoshboard obeys

- Swoshboard waits up to 60 s; the Swoshmail endpoint should finish within that.
- Signed Cloudinary URLs are generated per request and expire shortly after — download them immediately.