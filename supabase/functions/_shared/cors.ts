// Shared by every Edge Function a browser page calls directly (mp,
// solo-verify, contact, daily-deal-reminder — not stripe-webhook, which
// Stripe calls server-to-server with no CORS involved): the headers every
// response needs, and a one-line JSON response helper that keeps them on
// every reply, including error ones — easy to forget on an ad hoc
// `new Response(...)` and the browser's error is then "CORS", not
// whatever actually failed.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
