import type { SupabaseClient } from "@supabase/supabase-js";

// The "get the session, POST to an Edge Function with a bearer token,
// tolerantly parse a JSON body, throw a custom Error subclass on failure"
// wrapper both mpStore.ts's callMp and verifySoloGame.ts's verifySoloGame
// need — deliberately not supabase.functions.invoke, which swallows the
// function's own real error message behind a generic "Edge Function
// returned a non-2xx status code". Parametrized by the Error subclass (so
// callers can keep narrowing with `instanceof MpError` / `instanceof
// SoloVerifyError` as before) and an optional extra body-shape check for
// endpoints (like solo-verify) that can return 200 with an `{ ok: false }`
// body instead of a non-2xx status.
export async function callEdgeFunction<T>(
  supabase: SupabaseClient,
  url: string,
  // `object` rather than `Record<string, unknown>` — this only ever
  // JSON.stringifies it, never reads a field off it, and callers pass
  // either an inline literal or a named payload interface (which isn't
  // structurally assignable to Record<string, unknown> without its own
  // index signature).
  payload: object,
  ErrorCtor: new (message: string, status: number) => Error,
  options?: { fallbackMessage?: string; isOk?: (body: Record<string, unknown>) => boolean }
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ErrorCtor("You're signed out.", 401);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    /* empty / non-JSON */
  }

  const ok = res.ok && (options?.isOk ? options.isOk(body) : true);
  if (!ok) {
    throw new ErrorCtor(
      typeof body.error === "string" ? body.error : (options?.fallbackMessage ?? "Request failed."),
      res.status
    );
  }
  return body as T;
}
