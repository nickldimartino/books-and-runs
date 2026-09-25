// Books & Runs — contact/support Edge Function.
//
// Takes a bug report or feature request from app/support/page.tsx and
// emails it via Resend (https://resend.com). The whole point of routing
// this through a function instead of a client-side mailto: link is that
// the destination address never ships to the browser — it only ever lives
// in this function's SUPPORT_EMAIL secret, server-side.
//
// Deliberately callable by signed-out visitors, not just accounts — a guest
// hitting a bug is exactly who most needs to be able to report it, and
// there's no sensitive data on the other end of this function (it only
// ever sends outward, to one fixed address; it can't be used to spam
// anyone else). Abuse surface is "someone spams the developer's own inbox",
// self-limiting and low-stakes for a small indie app; MAX_SUBJECT/
// MAX_DESCRIPTION/MAX_ATTACHMENT_BYTES below are the actual guardrails.
//
// Deploy:
//   npx supabase secrets set RESEND_API_KEY=re_xxx SUPPORT_EMAIL=you@example.com
//   npx supabase functions deploy contact
// (SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically — used only
// to best-effort identify a signed-in sender for the email body, never to
// gate access.)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/cors.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
// No default — a real destination address belongs in a secret, not in
// source a public repo ships. The function simply refuses to send (500,
// see below) until this is actually configured.
const SUPPORT_EMAIL = Deno.env.get("SUPPORT_EMAIL") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const MAX_SUBJECT = 150;
const MAX_DESCRIPTION = 5000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // combined, decoded size
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AttachmentPayload {
  filename?: string;
  contentType?: string;
  base64?: string;
}

interface ContactPayload {
  type?: string;
  subject?: string;
  description?: string;
  replyTo?: string;
  attachments?: AttachmentPayload[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!RESEND_API_KEY || !SUPPORT_EMAIL) {
    console.error("contact function missing RESEND_API_KEY or SUPPORT_EMAIL secret");
    return json({ error: "Support form isn't configured yet." }, 500);
  }

  let payload: ContactPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // "privacy" = a data / account request (the fallback path next to in-app
  // account deletion) — same delivery, just labelled so it isn't lost among
  // bug reports.
  const type =
    payload.type === "feature" ? "feature" : payload.type === "bug" ? "bug" : payload.type === "privacy" ? "privacy" : null;
  const subject = (payload.subject ?? "").trim().slice(0, MAX_SUBJECT);
  const description = (payload.description ?? "").trim().slice(0, MAX_DESCRIPTION);
  if (!type || !subject || !description) {
    return json({ error: "A type, subject, and description are all required." }, 400);
  }

  const attachments = (payload.attachments ?? []).slice(0, MAX_ATTACHMENTS);
  const totalBytes = attachments.reduce((sum, a) => sum + Math.ceil((a.base64?.length ?? 0) * 0.75), 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    return json({ error: "Attachments are too large." }, 400);
  }

  // Best-effort — who's submitting this, if anyone's actually signed in.
  // Never gates access; a missing/invalid token just reads as anonymous.
  let submittedBy = "Anonymous (signed out)";
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    try {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await supabase.auth.getUser();
      if (data.user) submittedBy = `Signed in — ${data.user.email ?? data.user.id}`;
    } catch {
      // fall through as anonymous
    }
  }

  const typeLabel = type === "bug" ? "Bug" : type === "privacy" ? "Privacy request" : "Feature request";
  const replyTo = payload.replyTo?.trim();
  const bodyLines = [
    `Type: ${typeLabel}`,
    `From: ${submittedBy}`,
    replyTo ? `Reply-to given: ${replyTo}` : null,
    "",
    description,
  ].filter((line): line is string => line !== null);

  // The from-name ("Books & Runs") already says what app this is about, so
  // the subject line itself doesn't need to repeat it — just the type and
  // whatever the reporter wrote.
  const resendBody: Record<string, unknown> = {
    from: "Books & Runs <onboarding@resend.dev>",
    to: [SUPPORT_EMAIL],
    subject: `${typeLabel}: ${subject}`,
    text: bodyLines.join("\n"),
  };
  if (replyTo && EMAIL_RE.test(replyTo)) resendBody.reply_to = replyTo;
  if (attachments.length > 0) {
    resendBody.attachments = attachments
      .filter((a) => a.base64)
      .map((a) => ({ filename: (a.filename ?? "attachment").slice(0, 200), content: a.base64 }));
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(resendBody),
  });

  if (!res.ok) {
    console.error("Resend send failed:", res.status, await res.text().catch(() => ""));
    return json({ error: "Couldn't send — try again in a bit." }, 502);
  }

  return json({ ok: true });
});
