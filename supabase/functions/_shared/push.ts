// Web Push content + delivery rules, shared by every Edge Function that
// sends a push (mp, daily-deal-reminder). Pure and import-free so it runs
// under Deno as-is and is unit-tested from the Vitest engine project
// (src/push/push.test.ts):
//   - localised copy for all 10 app languages, picked by the RECIPIENT's saved
//     language (settings.language, migration 0055), personalised with the
//     opponent's display name and the round where known;
//   - per-category preferences (settings.notify_*, migration 0062);
//   - quiet hours in the recipient's local time (settings.quiet_hours_* +
//     tz_offset_minutes);
//   - a frequency cap so a burst of events can't spam one device.

export const PUSH_LOCALES = ["en", "zh", "ja", "ko", "de", "fr", "es", "pt-BR", "ru", "it"] as const;
export type PushLocale = (typeof PUSH_LOCALES)[number];

/** Falls back to English for null/unknown; "pt" and "zh-CN" style tags map
 * onto the closest supported locale. */
export function pickPushLocale(saved: string | null | undefined): PushLocale {
  if (!saved) return "en";
  const exact = PUSH_LOCALES.find((l) => l.toLowerCase() === saved.toLowerCase());
  if (exact) return exact;
  const base = saved.toLowerCase().split(/[-_]/)[0];
  return PUSH_LOCALES.find((l) => l.toLowerCase().split("-")[0] === base) ?? "en";
}

export type PushKind =
  | "your_turn"
  | "game_request"
  | "nudge"
  | "turn_warning"
  | "auto_played"
  | "forfeited"
  | "emote"
  | "friend_request"
  | "friend_accepted"
  | "streak_daily"
  | "streak_weekly";

export type PushCategory = "turns" | "invites" | "nudges" | "streaks";

export const PUSH_CATEGORY: Record<PushKind, PushCategory> = {
  your_turn: "turns",
  turn_warning: "turns",
  auto_played: "turns",
  forfeited: "turns",
  game_request: "invites",
  friend_request: "invites",
  friend_accepted: "invites",
  nudge: "nudges",
  emote: "nudges",
  streak_daily: "streaks",
  streak_weekly: "streaks",
};

export interface PushPrefs {
  notify_turns?: boolean | null;
  notify_invites?: boolean | null;
  notify_nudges?: boolean | null;
  notify_streaks?: boolean | null;
  /** Local hour 0–23 the quiet window starts/ends; either null = off. */
  quiet_hours_start?: number | null;
  quiet_hours_end?: number | null;
  /** Minutes to ADD to UTC to get the recipient's local time (JS
   * `-getTimezoneOffset()`); null = unknown → quiet hours not applied. */
  tz_offset_minutes?: number | null;
  language?: string | null;
}

export function categoryEnabled(prefs: PushPrefs | null | undefined, cat: PushCategory): boolean {
  const v =
    cat === "turns"
      ? prefs?.notify_turns
      : cat === "invites"
        ? prefs?.notify_invites
        : cat === "nudges"
          ? prefs?.notify_nudges
          : prefs?.notify_streaks;
  return v !== false; // unset (null/undefined) means the default: on
}

/** True when `nowMs` falls in the recipient's quiet window. A window that
 * wraps midnight (22 → 8) is handled; start === end means "off". */
export function inQuietHours(prefs: PushPrefs | null | undefined, nowMs: number): boolean {
  const s = prefs?.quiet_hours_start;
  const e = prefs?.quiet_hours_end;
  const off = prefs?.tz_offset_minutes;
  if (s == null || e == null || off == null || s === e) return false;
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || s > 23 || e < 0 || e > 23) return false;
  if (!Number.isFinite(off) || Math.abs(off) > 14 * 60 + 30) return false;
  const localMin = (((Math.floor(nowMs / 60_000) + off) % 1440) + 1440) % 1440;
  const localHour = Math.floor(localMin / 60);
  return s < e ? localHour >= s && localHour < e : localHour >= s || localHour < e;
}

/** Max pushes to one account per hour (counted from its inbox events). */
export const PUSH_HOURLY_CAP = 8;
export const underFrequencyCap = (recentCount: number, cap = PUSH_HOURLY_CAP) => recentCount < cap;

export type PushDecision = "send" | "category_off" | "quiet_hours";

export function shouldPush(prefs: PushPrefs | null | undefined, kind: PushKind, nowMs: number): PushDecision {
  if (!categoryEnabled(prefs, PUSH_CATEGORY[kind])) return "category_off";
  if (inQuietHours(prefs, nowMs)) return "quiet_hours";
  return "send";
}

interface Copy {
  title: string;
  body: string;
  /** Used instead of `body` when an opponent name is known. */
  named?: string;
}
type CopyTable = Record<PushKind, Copy>;

const en: CopyTable = {
  your_turn: { title: "Your turn", body: "It's your move in Books & Runs.", named: "{name} played — round {round}, your move." },
  game_request: { title: "Game invite", body: "You've been invited to a multiplayer game.", named: "{name} invited you to a game." },
  nudge: { title: "Nudge", body: "Someone's waiting on your move.", named: "{name} is waiting on your move." },
  turn_warning: { title: "Time is running out", body: "You have {time} left to play your turn." },
  auto_played: { title: "A turn was played for you", body: "Your time ran out, so a move was made for you. Play soon to avoid forfeiting." },
  forfeited: { title: "Game forfeited", body: "You ran out of time and forfeited a game." },
  emote: { title: "{name} sent a reaction", body: "{emote}" },
  friend_request: { title: "Friend request", body: "Someone wants to be your friend.", named: "{name} wants to be your friend." },
  friend_accepted: { title: "New friend", body: "Your friend request was accepted.", named: "{name} accepted your friend request." },
  streak_daily: { title: "Your streak is at risk!", body: "Play today's Daily Deal to keep your streak going. 🔥 {streak}" },
  streak_weekly: { title: "Your weekly streak is at risk!", body: "Play this week's Weekly Challenge to keep your streak going. 🔥 {streak}" },
};

const zh: CopyTable = {
  your_turn: { title: "轮到你了", body: "轮到你在 Books & Runs 中出牌了。", named: "{name}出牌了——第 {round} 轮,该你了。" },
  game_request: { title: "游戏邀请", body: "有人邀请你加入多人游戏。", named: "{name}邀请你加入一场对局。" },
  nudge: { title: "提醒", body: "有人在等你出牌。", named: "{name}在等你出牌。" },
  turn_warning: { title: "时间快到了", body: "你还有{time}来完成本回合。" },
  auto_played: { title: "已替你出牌", body: "你超时了,系统已替你走了一步。请尽快回来,以免被判弃权。" },
  forfeited: { title: "对局已弃权", body: "你因超时而退出了一场对局。" },
  emote: { title: "{name}发来了表情", body: "{emote}" },
  friend_request: { title: "好友请求", body: "有人想加你为好友。", named: "{name}想加你为好友。" },
  friend_accepted: { title: "新好友", body: "你的好友请求已被接受。", named: "{name}接受了你的好友请求。" },
  streak_daily: { title: "你的连续纪录有中断风险!", body: "今天玩一局每日挑战,保住你的连续纪录。🔥 {streak}" },
  streak_weekly: { title: "你的每周连续纪录有中断风险!", body: "本周玩一局每周挑战,保住你的连续纪录。🔥 {streak}" },
};

const ja: CopyTable = {
  your_turn: { title: "あなたの番です", body: "Books & Runs であなたの番です。", named: "{name}さんが手を打ちました — ラウンド{round}、あなたの番です。" },
  game_request: { title: "ゲームへの招待", body: "マルチプレイゲームに招待されました。", named: "{name}さんがゲームに招待しています。" },
  nudge: { title: "催促", body: "誰かがあなたの手番を待っています。", named: "{name}さんがあなたの手番を待っています。" },
  turn_warning: { title: "もうすぐ時間切れです", body: "あなたの番の残り時間は{time}です。" },
  auto_played: { title: "代わりに手を打ちました", body: "時間切れのため、代わりに1手打ちました。棄権にならないよう早めにプレイしてください。" },
  forfeited: { title: "ゲームを棄権しました", body: "時間切れのため、ゲームを棄権しました。" },
  emote: { title: "{name}さんからリアクション", body: "{emote}" },
  friend_request: { title: "フレンド申請", body: "フレンド申請が届いています。", named: "{name}さんからフレンド申請が届きました。" },
  friend_accepted: { title: "新しいフレンド", body: "フレンド申請が承認されました。", named: "{name}さんがフレンド申請を承認しました。" },
  streak_daily: { title: "連続記録が途切れそうです!", body: "今日のデイリーディールをプレイして連続記録を守りましょう。🔥 {streak}" },
  streak_weekly: { title: "週間の連続記録が途切れそうです!", body: "今週のウィークリーチャレンジをプレイして連続記録を守りましょう。🔥 {streak}" },
};

const ko: CopyTable = {
  your_turn: { title: "당신의 차례예요", body: "Books & Runs에서 당신의 차례예요.", named: "{name}님이 카드를 냈어요 — {round}라운드, 당신의 차례예요." },
  game_request: { title: "게임 초대", body: "멀티플레이 게임에 초대받았어요.", named: "{name}님이 게임에 초대했어요." },
  nudge: { title: "콕 찌르기", body: "누군가 당신의 차례를 기다리고 있어요.", named: "{name}님이 당신의 차례를 기다리고 있어요." },
  turn_warning: { title: "시간이 얼마 안 남았어요", body: "내 차례를 진행할 시간이 {time} 남았어요." },
  auto_played: { title: "대신 한 수를 뒀어요", body: "시간이 지나 대신 한 수를 뒀어요. 기권 처리되지 않도록 빨리 플레이하세요." },
  forfeited: { title: "게임 기권 처리", body: "시간이 초과되어 게임에서 기권 처리됐어요." },
  emote: { title: "{name}님이 반응을 보냈어요", body: "{emote}" },
  friend_request: { title: "친구 요청", body: "누군가 친구가 되고 싶어 해요.", named: "{name}님이 친구가 되고 싶어 해요." },
  friend_accepted: { title: "새 친구", body: "친구 요청이 수락됐어요.", named: "{name}님이 친구 요청을 수락했어요." },
  streak_daily: { title: "연속 기록이 끊길 위기예요!", body: "오늘의 데일리 딜을 플레이해서 연속 기록을 이어가세요. 🔥 {streak}" },
  streak_weekly: { title: "주간 연속 기록이 끊길 위기예요!", body: "이번 주 위클리 챌린지를 플레이해서 연속 기록을 이어가세요. 🔥 {streak}" },
};

const de: CopyTable = {
  your_turn: { title: "Du bist dran", body: "Du bist in Books & Runs am Zug.", named: "{name} hat gespielt — Runde {round}, du bist dran." },
  game_request: { title: "Spieleinladung", body: "Du wurdest zu einem Mehrspielerspiel eingeladen.", named: "{name} hat dich zu einem Spiel eingeladen." },
  nudge: { title: "Anstupser", body: "Jemand wartet auf deinen Zug.", named: "{name} wartet auf deinen Zug." },
  turn_warning: { title: "Die Zeit läuft ab", body: "Dir bleiben noch {time} für deinen Zug." },
  auto_played: { title: "Für dich wurde gespielt", body: "Deine Zeit ist abgelaufen, daher wurde ein Zug für dich gemacht. Spiel bald weiter, sonst gibst du auf." },
  forfeited: { title: "Spiel aufgegeben", body: "Deine Zeit ist abgelaufen und du hast ein Spiel aufgegeben." },
  emote: { title: "{name} hat reagiert", body: "{emote}" },
  friend_request: { title: "Freundschaftsanfrage", body: "Jemand möchte mit dir befreundet sein.", named: "{name} möchte mit dir befreundet sein." },
  friend_accepted: { title: "Neuer Freund", body: "Deine Freundschaftsanfrage wurde angenommen.", named: "{name} hat deine Freundschaftsanfrage angenommen." },
  streak_daily: { title: "Deine Serie ist in Gefahr!", body: "Spiel den heutigen Tages-Deal, um deine Serie zu halten. 🔥 {streak}" },
  streak_weekly: { title: "Deine Wochenserie ist in Gefahr!", body: "Spiel die Wochen-Challenge dieser Woche, um deine Serie zu halten. 🔥 {streak}" },
};

const fr: CopyTable = {
  your_turn: { title: "À toi de jouer", body: "C'est ton tour dans Books & Runs.", named: "{name} a joué — manche {round}, à toi." },
  game_request: { title: "Invitation à une partie", body: "Tu as été invité à une partie multijoueur.", named: "{name} t'a invité à une partie." },
  nudge: { title: "Relance", body: "Quelqu'un attend ton coup.", named: "{name} attend ton coup." },
  turn_warning: { title: "Le temps presque écoulé", body: "Il te reste {time} pour jouer ton tour." },
  auto_played: { title: "Un tour a été joué pour toi", body: "Ton temps est écoulé, un coup a donc été joué à ta place. Reviens vite pour ne pas déclarer forfait." },
  forfeited: { title: "Partie abandonnée", body: "Ton temps est écoulé et tu as abandonné une partie." },
  emote: { title: "{name} a envoyé une réaction", body: "{emote}" },
  friend_request: { title: "Demande d'ami", body: "Quelqu'un veut devenir ton ami.", named: "{name} veut devenir ton ami." },
  friend_accepted: { title: "Nouvel ami", body: "Ta demande d'ami a été acceptée.", named: "{name} a accepté ta demande d'ami." },
  streak_daily: { title: "Ta série est en danger !", body: "Joue le défi du jour pour garder ta série. 🔥 {streak}" },
  streak_weekly: { title: "Ta série hebdomadaire est en danger !", body: "Joue le défi de la semaine pour garder ta série. 🔥 {streak}" },
};

const es: CopyTable = {
  your_turn: { title: "Tu turno", body: "Es tu turno en Books & Runs.", named: "{name} jugó — ronda {round}, es tu turno." },
  game_request: { title: "Invitación a una partida", body: "Te han invitado a una partida multijugador.", named: "{name} te invitó a una partida." },
  nudge: { title: "Recordatorio", body: "Alguien está esperando tu jugada.", named: "{name} está esperando tu jugada." },
  turn_warning: { title: "Se acaba el tiempo", body: "Te quedan {time} para jugar tu turno." },
  auto_played: { title: "Se jugó un turno por ti", body: "Se acabó tu tiempo, así que se hizo una jugada por ti. Juega pronto para no perder por abandono." },
  forfeited: { title: "Partida abandonada", body: "Se acabó tu tiempo y abandonaste una partida." },
  emote: { title: "{name} envió una reacción", body: "{emote}" },
  friend_request: { title: "Solicitud de amistad", body: "Alguien quiere ser tu amigo.", named: "{name} quiere ser tu amigo." },
  friend_accepted: { title: "Nuevo amigo", body: "Tu solicitud de amistad fue aceptada.", named: "{name} aceptó tu solicitud de amistad." },
  streak_daily: { title: "¡Tu racha está en peligro!", body: "Juega el Reparto Diario de hoy para mantener tu racha. 🔥 {streak}" },
  streak_weekly: { title: "¡Tu racha semanal está en peligro!", body: "Juega el Desafío Semanal de esta semana para mantener tu racha. 🔥 {streak}" },
};

const ptBR: CopyTable = {
  your_turn: { title: "Sua vez", body: "É a sua vez em Books & Runs.", named: "{name} jogou — rodada {round}, sua vez." },
  game_request: { title: "Convite para jogo", body: "Você foi convidado para uma partida multijogador.", named: "{name} convidou você para uma partida." },
  nudge: { title: "Cutucada", body: "Alguém está esperando sua jogada.", named: "{name} está esperando sua jogada." },
  turn_warning: { title: "O tempo está acabando", body: "Você tem {time} para jogar sua vez." },
  auto_played: { title: "Uma jogada foi feita por você", body: "Seu tempo acabou, então uma jogada foi feita por você. Jogue logo para não perder por abandono." },
  forfeited: { title: "Partida abandonada", body: "Seu tempo acabou e você abandonou uma partida." },
  emote: { title: "{name} enviou uma reação", body: "{emote}" },
  friend_request: { title: "Pedido de amizade", body: "Alguém quer ser seu amigo.", named: "{name} quer ser seu amigo." },
  friend_accepted: { title: "Novo amigo", body: "Seu pedido de amizade foi aceito.", named: "{name} aceitou seu pedido de amizade." },
  streak_daily: { title: "Sua sequência está em risco!", body: "Jogue a Rodada Diária de hoje para manter sua sequência. 🔥 {streak}" },
  streak_weekly: { title: "Sua sequência semanal está em risco!", body: "Jogue o Desafio Semanal desta semana para manter sua sequência. 🔥 {streak}" },
};

const ru: CopyTable = {
  your_turn: { title: "Твой ход", body: "Твой ход в Books & Runs.", named: "{name} сходил — раунд {round}, твой ход." },
  game_request: { title: "Приглашение в игру", body: "Тебя пригласили в многопользовательскую игру.", named: "{name} приглашает тебя в игру." },
  nudge: { title: "Напоминание", body: "Кто-то ждёт твоего хода.", named: "{name} ждёт твоего хода." },
  turn_warning: { title: "Время на исходе", body: "На твой ход осталось {time}." },
  auto_played: { title: "Ход сделан за тебя", body: "Время вышло, поэтому за тебя сделали ход. Возвращайся скорее, иначе засчитают сдачу." },
  forfeited: { title: "Игра сдана", body: "Время вышло, и ты сдал игру." },
  emote: { title: "{name} отправил реакцию", body: "{emote}" },
  friend_request: { title: "Заявка в друзья", body: "Кто-то хочет добавить тебя в друзья.", named: "{name} хочет добавить тебя в друзья." },
  friend_accepted: { title: "Новый друг", body: "Твою заявку в друзья приняли.", named: "{name} принял(а) твою заявку в друзья." },
  streak_daily: { title: "Твоя серия под угрозой!", body: "Сыграй «Расклад дня», чтобы не потерять серию. 🔥 {streak}" },
  streak_weekly: { title: "Твоя недельная серия под угрозой!", body: "Сыграй «Испытание недели», чтобы не потерять серию. 🔥 {streak}" },
};

const it: CopyTable = {
  your_turn: { title: "Tocca a te", body: "È il tuo turno in Books & Runs.", named: "{name} ha giocato — round {round}, tocca a te." },
  game_request: { title: "Invito a una partita", body: "Sei stato invitato a una partita multigiocatore.", named: "{name} ti ha invitato a una partita." },
  nudge: { title: "Sollecito", body: "Qualcuno aspetta la tua mossa.", named: "{name} aspetta la tua mossa." },
  turn_warning: { title: "Il tempo sta per scadere", body: "Ti restano {time} per giocare il tuo turno." },
  auto_played: { title: "Un turno è stato giocato per te", body: "Il tuo tempo è scaduto, quindi è stata fatta una mossa al posto tuo. Gioca presto per non perdere a tavolino." },
  forfeited: { title: "Partita abbandonata", body: "Il tuo tempo è scaduto e hai abbandonato una partita." },
  emote: { title: "{name} ha inviato una reazione", body: "{emote}" },
  friend_request: { title: "Richiesta di amicizia", body: "Qualcuno vuole essere tuo amico.", named: "{name} vuole essere tuo amico." },
  friend_accepted: { title: "Nuovo amico", body: "La tua richiesta di amicizia è stata accettata.", named: "{name} ha accettato la tua richiesta di amicizia." },
  streak_daily: { title: "La tua striscia è a rischio!", body: "Gioca la Partita del giorno per mantenere la tua striscia. 🔥 {streak}" },
  streak_weekly: { title: "La tua striscia settimanale è a rischio!", body: "Gioca la Sfida settimanale di questa settimana per mantenere la striscia. 🔥 {streak}" },
};

export const PUSH_COPY: Record<PushLocale, CopyTable> = { en, zh, ja, ko, de, fr, es, "pt-BR": ptBR, ru, it };

export interface PushVars {
  name?: string | null;
  round?: number | null;
  /** Hours left, for turn_warning. */
  hours?: number | null;
  emote?: string | null;
  streak?: number | null;
}

/** "14 hours" / "2 days" in the recipient's language. */
export function formatHoursLeft(hours: number, locale: PushLocale): string {
  const h = Math.max(1, Math.round(hours));
  try {
    if (h >= 48) {
      return new Intl.NumberFormat(locale, { style: "unit", unit: "day", unitDisplay: "long" }).format(Math.round(h / 24));
    }
    return new Intl.NumberFormat(locale, { style: "unit", unit: "hour", unitDisplay: "long" }).format(h);
  } catch {
    return `${h}h`;
  }
}

const cleanName = (s: string) =>
  s
    .replace(/[\u0000-\u001F\u007F‪-‮⁦-⁩]/g, "")
    .trim()
    .slice(0, 40);

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Title + body for one push, in the recipient's language. */
export function pushText(kind: PushKind, localeRaw: string | null | undefined, vars: PushVars = {}): { title: string; body: string } {
  const locale = pickPushLocale(localeRaw);
  const copy = PUSH_COPY[locale][kind];
  const name = vars.name ? cleanName(vars.name) : "";
  const v: Record<string, string> = {
    name,
    round: vars.round != null ? String(vars.round) : "",
    time: vars.hours != null ? formatHoursLeft(vars.hours, locale) : "",
    emote: vars.emote ?? "",
    streak: vars.streak != null ? String(vars.streak) : "",
  };
  // A named body needs every placeholder it uses; degrade to the generic one.
  const useNamed = !!copy.named && !!name && (!copy.named.includes("{round}") || !!v.round);
  return {
    title: fill(copy.title, { ...v, name: name || "" }).trim(),
    body: fill(useNamed ? copy.named! : copy.body, v).trim(),
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

export function buildPushPayload(
  kind: PushKind,
  localeRaw: string | null | undefined,
  vars: PushVars,
  gameId: string | null
): PushPayload {
  const { title, body } = pushText(kind, localeRaw, vars);
  const gameKinds: PushKind[] = ["your_turn", "game_request", "nudge", "turn_warning", "auto_played", "forfeited", "emote"];
  const isGame = !!gameId && gameKinds.includes(kind);
  return {
    title: title || "Books & Runs",
    body,
    url: isGame ? `/multiplayer/play?g=${gameId}` : kind.startsWith("friend_") ? "/friends" : "/",
    tag: isGame ? `mp-${gameId}` : kind,
  };
}
