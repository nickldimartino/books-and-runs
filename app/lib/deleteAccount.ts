import type { SupabaseClient } from "@supabase/supabase-js";
import { callEdgeFunction } from "./callEdgeFunction";

/**
 * Self-serve account deletion — the `delete-account` Edge Function (service
 * role) re-verifies the password server-side, resigns/cancels the account's
 * multiplayer games, anonymises its seats, removes the profile photo and the
 * auth user (everything else cascades). See supabase/functions/delete-account.
 */

export class DeleteAccountError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DeleteAccountError";
    this.status = status;
  }
}

const FN_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_SUPABASE_URL
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`
    : "";

export async function deleteMyAccount(supabase: SupabaseClient, password: string): Promise<void> {
  await callEdgeFunction(supabase, FN_URL, { password, confirm: true }, DeleteAccountError, {
    fallbackMessage: "Couldn't delete the account — try again in a moment.",
  });
}

/** Does the typed text match the (translated) confirmation word? Loose on
 * case and surrounding whitespace, strict otherwise. */
export function confirmWordMatches(typed: string, word: string): boolean {
  const norm = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase();
  return norm(word).length > 0 && norm(typed) === norm(word);
}
