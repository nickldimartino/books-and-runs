"use client";

// A one-time "let's get you set up" prompt shown right after a brand-new
// account finishes signing up (see onboardingStore.ts for how Home knows
// to show this and only this once) — pick a display name and avatar, pick
// a language, optionally turn on turn notifications. All three are also
// always reachable from Settings/the profile page later, so this is a
// convenience nudge at the one moment they're most likely to matter, never
// a gate: every path out (X, backdrop, "Skip", "Done") dismisses it for
// good on this account, and leaving the name blank just keeps whatever the
// account was created with.
//
// Deliberately doesn't auto-trigger the native notification permission
// prompt — that's the "soft-ask" pattern modern apps use instead of
// surprising a first-time visitor with a browser permission dialog before
// they've even seen the app: our own "Turn on notifications" button is the
// real user gesture that then calls subscribeToPush(), which is what
// actually asks the browser.

import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { pushLocale } from "../lib/accountSettingsSync";
import { DEFAULT_COLOR, EMOJI_OPTIONS } from "../lib/avatarPresets";
import { useT } from "../lib/i18n/LocaleProvider";
import {
  DisplayNameTakenError,
  fetchOwnDisplayName,
  MAX_DISPLAY_NAME_LENGTH,
  updateLeaderboardAvatarEmoji,
  updateLeaderboardDisplayName,
} from "../lib/leaderboardStore";
import { LocaleId, LOCALES } from "../lib/localeStore";
import {
  getPushPermission,
  isIosSafariNonStandalone,
  isPushSupported,
  subscribeToPush,
} from "../lib/pushSubscriptions";
import { ContentRejectedError, contentRejectionKey } from "../lib/safetyStore";
import { supabase } from "../lib/supabaseClient";
import { translateError } from "../lib/i18n/serverErrors";

// A compact subset, not the full 46 — this is a "pick something now, refine
// later" step, not the real picker (that's the profile page, one tap away
// from every avatar shown anywhere). Every emoji here is unconditionally
// free, same list EMOJI_OPTIONS itself only ever holds.
const ONBOARDING_EMOJI_CHOICES = EMOJI_OPTIONS.slice(0, 16);

export function WelcomeOnboarding({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  const { t, locale, setLocale } = useT();
  const { user } = useAuth();
  const [pushState, setPushState] = useState<"unsupported" | "off" | "on" | "denied" | "busy">("off");
  const [pushError, setPushError] = useState<string | null>(null);

  // ── Identity: display name + avatar emoji ──────────────────────────────
  // Both already exist and are always reachable from the profile page later
  // — this is a nudge at the moment a new account is most likely to still
  // be a generic default name, not a gate (skippable like everything else
  // here). A fresh account already has a real (randomly assigned) name and
  // avatar the instant it's created, so this only overwrites either one if
  // the player actually picks something here.
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);
  const [chosenEmoji, setChosenEmoji] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);

  useEffect(() => {
    if (!open || !supabase || !user) return;
    fetchOwnDisplayName(supabase, user.id)
      .then((name) => setNameInput(name ?? ""))
      .catch(() => {});
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    const permission = getPushPermission();
    setPushState(permission === "unsupported" ? "unsupported" : permission === "denied" ? "denied" : "off");
  }, [open]);

  if (!open) return null;

  async function handleNameBlur() {
    if (!supabase || !user) return;
    const trimmed = nameInput.trim();
    setNameError(null);
    setNameSaved(false);
    if (!trimmed) return; // leaving it blank keeps the existing name, not an error here
    try {
      await updateLeaderboardDisplayName(supabase, user.id, trimmed);
      setNameSaved(true);
    } catch (err) {
      if (err instanceof DisplayNameTakenError) setNameError(translateError(err.message, t));
      else if (err instanceof ContentRejectedError) setNameError(t(contentRejectionKey(err.issue, "name")));
      else console.error("Failed to save display name from onboarding:", err);
    }
  }

  async function handleChooseEmoji(emoji: string) {
    if (!supabase || !user) return;
    setChosenEmoji(emoji);
    setAvatarSaving(true);
    try {
      await updateLeaderboardAvatarEmoji(supabase, user.id, emoji, DEFAULT_COLOR);
    } catch (err) {
      console.error("Failed to save avatar from onboarding:", err);
    } finally {
      setAvatarSaving(false);
    }
  }

  function handleLocaleChange(id: LocaleId) {
    setLocale(id);
    pushLocale(supabase, user?.id ?? null, id);
  }

  async function handleEnablePush() {
    if (!supabase || !user) return;
    setPushState("busy");
    setPushError(null);
    const result = await subscribeToPush(supabase, user.id);
    if (result.ok) setPushState("on");
    else if (result.reason === "denied") setPushState("denied");
    else {
      setPushState("off");
      setPushError(result.reason ? translateError(result.reason, t) : t("welcome.push.error"));
    }
  }

  const showPushSection = isPushSupported() || isIosSafariNonStandalone();

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("welcome.title")}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-sm flex-col gap-5 overflow-y-auto rounded-2xl bg-[var(--panel)] p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-[var(--heading)]">{t("welcome.title")}</h1>
            <p className="mt-0.5 text-sm text-[var(--muted)]">{t("welcome.subtitle")}</p>
          </div>
          <button
            onClick={onDismiss}
            aria-label={t("common.dismiss")}
            className="shrink-0 rounded-full p-1 text-[var(--faint)] hover:bg-[var(--panel-soft)] hover:text-[var(--muted)]"
          >
            <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
            {t("welcome.identity")}
          </p>
          <div className="flex flex-col gap-1">
            <input
              id="onboarding-display-name"
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setNameError(null);
                setNameSaved(false);
              }}
              onBlur={handleNameBlur}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              placeholder={t("welcome.identity.namePlaceholder")}
              aria-label={t("welcome.identity.namePlaceholder")}
              className="rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            />
            {nameError && <p className="text-xs text-[var(--danger)]">{nameError}</p>}
            {!nameError && nameSaved && <p className="text-xs text-[var(--muted)]">{t("common.saved")}</p>}
          </div>
          <div className="grid grid-cols-8 gap-1.5">
            {ONBOARDING_EMOJI_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleChooseEmoji(emoji)}
                disabled={avatarSaving}
                aria-label={t("player.picture.useEmoji", { emoji })}
                aria-pressed={chosenEmoji === emoji}
                className={`grid aspect-square place-items-center rounded-lg text-lg transition ${
                  chosenEmoji === emoji
                    ? "bg-[var(--accent)]/20 ring-2 ring-[var(--accent)]"
                    : "bg-[var(--panel-soft)] hover:bg-[var(--elevated)]"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--faint)]">{t("welcome.identity.hint")}</p>
        </section>

        <section className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
            {t("welcome.language")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {LOCALES.map((l) => (
              <button
                key={l.id}
                onClick={() => handleLocaleChange(l.id)}
                aria-label={`${l.name} (${l.nativeName})`}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
                  locale === l.id
                    ? "bg-[var(--accent)] text-[var(--on-accent)]"
                    : "bg-[var(--panel-soft)] text-[var(--muted)] hover:bg-[var(--elevated)]"
                }`}
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {l.flag}
                </span>
                {l.nativeName}
              </button>
            ))}
          </div>
        </section>

        {showPushSection && (
          <section className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--faint)]">
              {t("welcome.notifications")}
            </p>
            {pushState === "unsupported" ? (
              <p className="text-xs text-[var(--faint)]">
                {isIosSafariNonStandalone() ? t("settings.push.iosUnsupported") : t("settings.push.unsupported")}
              </p>
            ) : pushState === "denied" ? (
              <p className="text-xs text-[var(--faint)]">{t("settings.push.blocked")}</p>
            ) : pushState === "on" ? (
              <p className="rounded-lg bg-[var(--accent)]/10 px-3 py-2 text-xs font-medium text-[var(--accent)]">
                {t("welcome.push.enabled")}
              </p>
            ) : (
              <>
                <p className="text-xs text-[var(--muted)]">{t("welcome.push.body")}</p>
                <button
                  onClick={handleEnablePush}
                  disabled={pushState === "busy"}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {pushState === "busy" ? t("welcome.push.enabling") : t("welcome.push.enable")}
                </button>
              </>
            )}
            {pushError && <p className="text-xs text-[var(--danger)]">{pushError}</p>}
          </section>
        )}

        <button
          onClick={onDismiss}
          className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
        >
          {t("welcome.done")}
        </button>
      </div>
    </div>
  );
}
