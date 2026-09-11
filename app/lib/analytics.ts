// Anonymous aggregate product events → the `app_events` table (migration
// 0016). A row is only ever "an event of this type with these coarse props
// happened" — there is deliberately NO user id, session id, IP, or anything
// that identifies a person, so this stays consistent with the privacy
// policy's "no tracking". It answers questions like "which difficulty is
// most played" and "what's the solo completion rate", nothing else.
//
// Dependency-free raw fetch (like errorReporter) so it never touches the
// initial bundle's critical path, and always best-effort.

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Props = Record<string, string | number | boolean>;

export function track(name: string, props: Props = {}): void {
  try {
    if (!URL_BASE || !ANON_KEY || typeof fetch === "undefined") return;
    fetch(`${URL_BASE}/rest/v1/app_events`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ name: name.slice(0, 64), props }),
    }).catch(() => {});
  } catch {
    /* best-effort */
  }
}
