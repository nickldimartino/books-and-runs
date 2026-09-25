import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentIssue, ContentKind } from "@/safety/contentFilter";
import type { TranslationKey } from "./i18n/keys";

/**
 * Block / report / content-rejection helpers (migration 0060). Blocking hides
 * an account from you and you from them (friends, invites, leaderboard,
 * emotes) without telling them; reports land in `user_reports` for the
 * developer to review — there's deliberately no in-app read path for those.
 */

export interface BlockedUser {
  userId: string;
  displayName: string | null;
  blockedAt: string;
}

export async function blockUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.rpc("block_user", { p_user: userId });
  if (error) throw error;
}

export async function unblockUser(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase.rpc("unblock_user", { p_user: userId });
  if (error) throw error;
}

export async function getMyBlocks(supabase: SupabaseClient): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc("my_blocks");
  if (error) throw error;
  return ((data as { user_id: string; display_name: string | null; blocked_at: string }[]) ?? []).map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    blockedAt: r.blocked_at,
  }));
}

// ── reports ──────────────────────────────────────────────────────────────

export type ReportKind = "name" | "bio" | "photo" | "behavior" | "other";
export type ReportReason =
  | "offensive"
  | "harassment"
  | "impersonation"
  | "cheating"
  | "spam"
  | "inappropriate_photo"
  | "other";

export const REPORT_REASONS: ReportReason[] = [
  "offensive",
  "harassment",
  "impersonation",
  "cheating",
  "spam",
  "inappropriate_photo",
  "other",
];

/** Where the report was filed from — stored with it for context. */
export type ReportContext = "profile" | "friends" | "mp_game" | "club" | "tournament" | "leaderboard";

export const MAX_REPORT_NOTE_LENGTH = 280;

/** Which part of the profile a reason is about (the report's `kind`). */
export function kindForReason(reason: ReportReason): ReportKind {
  switch (reason) {
    case "inappropriate_photo":
      return "photo";
    case "impersonation":
    case "offensive":
      return "name";
    case "harassment":
    case "cheating":
    case "spam":
      return "behavior";
    default:
      return "other";
  }
}

// U+0000–U+001F, U+007F, and the bidi override/isolate marks.
const CONTROL_AND_BIDI = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}${String.fromCharCode(0x202a)}-${String.fromCharCode(0x202e)}${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`,
  "g"
);

export function cleanReportNote(note: string | null | undefined): string | null {
  const cleaned = (note ?? "").replace(CONTROL_AND_BIDI, "").trim().slice(0, MAX_REPORT_NOTE_LENGTH);
  return cleaned || null;
}

export interface ReportInput {
  reportedUserId: string;
  reason: ReportReason;
  /** Defaults from the reason (see kindForReason). */
  kind?: ReportKind;
  note?: string | null;
  gameId?: string | null;
  context?: ReportContext;
}

export async function reportUser(supabase: SupabaseClient, input: ReportInput): Promise<void> {
  const { error } = await supabase.rpc("report_user", {
    p_reported_user_id: input.reportedUserId,
    p_kind: input.kind ?? kindForReason(input.reason),
    p_reason: input.reason,
    p_note: cleanReportNote(input.note),
    p_game_id: input.gameId ?? null,
    p_context: input.context ?? null,
  });
  if (error) throw error;
}

// ── content rejection (display names, bios, club names) ──────────────────

/** Thrown by the display-name / bio setters when the text is refused — by the
 * client pre-check (src/safety/contentFilter.ts) or by the database trigger
 * (migration 0060), which report the same issue codes. */
export class ContentRejectedError extends Error {
  issue: ContentIssue;
  kind: ContentKind;
  constructor(issue: ContentIssue, kind: ContentKind) {
    super(issue === "link" ? "Links aren't allowed here" : kind === "bio" ? "That bio isn't allowed" : "That name isn't allowed");
    this.name = "ContentRejectedError";
    this.issue = issue;
    this.kind = kind;
  }
}

/** Recognises the trigger's error messages coming back from Supabase. */
export function contentRejectionFromServer(message: string | undefined, kind: ContentKind): ContentRejectedError | null {
  const m = (message ?? "").toLowerCase();
  if (m.includes("links aren't allowed") || m.includes("links aren’t allowed")) return new ContentRejectedError("link", kind);
  if (m.includes("that name is reserved")) return new ContentRejectedError("impersonation", "name");
  if (m.includes("that bio isn't allowed")) return new ContentRejectedError("profanity", "bio");
  if (m.includes("that name isn't allowed")) return new ContentRejectedError("profanity", kind === "bio" ? "name" : kind);
  return null;
}

/** The translated, friendly message for a rejection. */
export function contentRejectionKey(issue: ContentIssue, kind: ContentKind): TranslationKey {
  if (issue === "link") return "safety.content.link";
  if (issue === "impersonation") return "safety.content.reserved";
  if (issue === "empty") return "safety.content.empty";
  return kind === "bio" ? "safety.content.bio" : "safety.content.name";
}
