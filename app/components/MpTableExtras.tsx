"use client";

// Small additions under the MP board: quick emotes (fixed presets, rate
// limited server-side), a transient bubble + short log of recent ones, and a
// "Players" list where any human opponent can be reported or blocked.

import { useCallback, useEffect, useState } from "react";
import { EMOTE_EMOJI, EMOTE_IDS, EmoteId } from "@/mp/emotes";
import type { RedactedPlayer } from "@/mp/types";
import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import { translateError } from "../lib/i18n/serverErrors";
import { getMpEmotes, MpEmote, sendMpEmote } from "../lib/mpStore";
import { supabase } from "../lib/supabaseClient";
import { SafetyMenu } from "./SafetyMenu";

const BUBBLE_MS = 8000;

export function MpTableExtras({
  gameId,
  players,
  myUserId,
  emoteTick,
  canEmote,
  onBlocked,
}: {
  gameId: string;
  players: RedactedPlayer[];
  myUserId: string | undefined;
  emoteTick: number;
  canEmote: boolean;
  onBlocked?: () => void;
}) {
  const { t } = useT();
  const [emotes, setEmotes] = useState<MpEmote[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [cooling, setCooling] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    try {
      setEmotes(await getMpEmotes(supabase, gameId, 20));
    } catch {
      /* 0061 not applied yet — no emotes, no error */
    }
  }, [gameId]);

  useEffect(() => {
    load();
  }, [load, emoteTick]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(id);
  }, []);

  const nameOfUser = (uid: string) => (uid === myUserId ? t("gameOver.you") : (players.find((p) => p.userId === uid)?.name ?? "?"));
  const bubble = emotes.find((e) => e.sender_id !== myUserId && now - Date.parse(e.created_at) < BUBBLE_MS);
  const log = emotes.slice(0, 5);
  const others = players.filter((p) => !p.isAI && p.userId && p.userId !== myUserId);

  async function send(id: EmoteId) {
    if (!supabase || cooling) return;
    setError(null);
    setCooling(true);
    setTimeout(() => setCooling(false), 3000);
    try {
      await sendMpEmote(supabase, gameId, id);
      load();
    } catch (err) {
      setError(translateError(err instanceof Error ? err.message : "", t) || t("emotes.error"));
    }
  }

  return (
    <section className="flex flex-col gap-2 rounded-xl bg-[var(--panel-soft)] p-3">
      {bubble && (
        <p role="status" className="self-center rounded-full bg-[var(--accent)]/15 px-3 py-1 text-sm text-[var(--heading)]">
          {nameOf(bubble)}
        </p>
      )}
      {canEmote && (
        <div className="flex flex-wrap justify-center gap-1.5" role="group" aria-label={t("emotes.heading")}>
          {EMOTE_IDS.map((id) => (
            <button
              key={id}
              onClick={() => send(id)}
              disabled={cooling}
              title={t(`emote.${id}` as TranslationKey)}
              aria-label={t(`emote.${id}` as TranslationKey)}
              className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-base hover:bg-[var(--panel-soft)] disabled:opacity-50"
            >
              {EMOTE_EMOJI[id]}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-center text-xs text-[var(--danger)]">{error}</p>}
      {log.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-[var(--faint)]">
          {log.map((e) => (
            <li key={e.id}>
              <span className="text-[var(--muted)]">{nameOfUser(e.sender_id)}</span> {EMOTE_EMOJI[e.emote]}{" "}
              {t(`emote.${e.emote}` as TranslationKey)}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <details className="text-xs text-[var(--muted)]">
          <summary className="cursor-pointer">{t("safety.players.heading")}</summary>
          <ul className="mt-1 flex flex-col gap-1">
            {others.map((p) => (
              <li key={p.seat} className="flex items-center justify-between rounded-lg bg-[var(--panel)] px-3 py-1.5">
                <span className="truncate text-[var(--heading)]">{p.name}</span>
                <SafetyMenu
                  targetUserId={p.userId!}
                  targetName={p.name}
                  context="mp_game"
                  gameId={gameId}
                  onBlocked={() => onBlocked?.()}
                />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );

  function nameOf(e: MpEmote) {
    return t("emotes.bubble", { name: nameOfUser(e.sender_id), emoji: EMOTE_EMOJI[e.emote], text: t(`emote.${e.emote}` as TranslationKey) });
  }
}
