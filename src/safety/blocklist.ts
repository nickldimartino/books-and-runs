// Compact multilingual blocklist for public, user-chosen text (display names,
// bios, club/tournament names). Deliberately SMALL: this is a first line of
// defence against the worst slurs/profanity and staff impersonation, not a
// moderation system — the report flow (migration 0060) is the real backstop.
//
// Every entry is matched AFTER normalisation (see contentFilter.ts:
// lower-case, accent-stripped, leet-folded, punctuation/space removed), in
// one of three modes chosen to avoid the "Scunthorpe problem":
//   sub  — the squashed text (all separators removed) CONTAINS the term.
//          Only for long/unambiguous terms and CJK, where a false positive
//          across a word boundary is implausible.
//   stem — some whole word STARTS WITH the term (fuck → fucker, fucking).
//   word — some whole word EQUALS the term (ass, dick, cock).
// Reserved (impersonation) terms apply to display names only.
//
// The same list is mirrored into the database by
// supabase/migrations/0060_blocks_reports_content_filter.sql (generated with
// scripts/gen-blocklist-sql.mjs; contentFilter.test.ts fails if they drift).

export type BlockMode = "sub" | "stem" | "word";

export interface BlockTerm {
  term: string;
  mode: BlockMode;
}

const sub = (...terms: string[]): BlockTerm[] => terms.map((term) => ({ term, mode: "sub" }));
const stem = (...terms: string[]): BlockTerm[] => terms.map((term) => ({ term, mode: "stem" }));
const word = (...terms: string[]): BlockTerm[] => terms.map((term) => ({ term, mode: "word" }));

export const BLOCKED_TERMS: BlockTerm[] = [
  // English
  ...sub("nigger", "nigga", "faggot", "motherfuck", "cocksuck", "heilhitler", "whitepower", "gasthejews"),
  ...stem("fuck", "shit", "cunt", "bitch", "whore", "slut", "pussy", "asshole", "bastard", "retard", "jizz", "porn", "paedo", "pedophil", "rapist"),
  ...word("dick", "cock", "twat", "cum", "kike", "chink", "spic", "tranny", "pedo", "rape", "kkk", "kys", "penis", "vagina", "tits", "wank", "wanker", "wankers"),
  // Spanish
  ...stem("mierda", "cabron", "pendejo", "joder", "culero", "hijueputa", "hijodeputa"),
  ...word("verga", "coño", "zorra", "puta", "putas", "puto", "putos", "putita", "marica", "maricon", "maricones", "chinga", "chingar", "chingada", "chingado", "chingon"),
  // French
  ...stem("putain", "connard", "connasse", "encule", "batard", "enfoire", "couille"),
  ...word("merde", "pute", "ntm", "fdp", "salope", "salopes", "nique", "niquer"),
  // German
  ...stem("scheiss", "arschloch", "fotze", "wichser", "schlampe", "missgeburt", "schwuchtel", "kanake"),
  ...sub("hurensohn"),
  ...word("neger", "spast", "hure", "fick", "ficken", "ficker", "nutte", "nutten"),
  // Italian
  ...stem("cazzo", "stronz", "puttana", "minchia", "coglione", "frocio", "fanculo", "merda"),
  ...sub("vaffanculo", "porcodio", "porcamadonna"),
  ...word("troia"),
  // Portuguese
  ...stem("caralho", "buceta", "viado", "arrombad", "vagabund", "punheta", "otario", "cuzao", "merda"),
  ...sub("filhodaputa"),
  ...word("porra", "foda", "cacete"),
  // Russian (Cyrillic, ё folded to е) and common transliterations
  ...stem("хуй", "хуе", "пизд", "ебан", "ебат", "ебал", "бляд", "блят", "мудак", "мудил", "гандон", "пидор", "пидар", "залуп", "шлюх", "blyat", "blyad", "pidor", "pidar", "pizd", "mudak", "ebat"),
  ...sub("нахуй", "долбоеб", "nahuy"),
  ...word("чмо", "huy", "suka", "сука", "суки", "суку"),
  // Japanese
  ...sub("死ね", "殺す", "ちんこ", "まんこ", "ちんぽ", "キチガイ", "ガイジ", "ファック", "レイプ"),
  // Korean
  ...sub("씨발", "시발", "개새끼", "병신", "지랄", "좆", "존나", "미친놈", "창녀", "느금마", "ㅅㅂ", "ㅂㅅ", "ㅈㄹ"),
  // Chinese
  ...sub("傻逼", "傻屄", "煞笔", "操你妈", "草泥马", "他妈的", "王八蛋", "狗屎", "去死", "婊子", "贱人", "妓女", "强奸", "鸡巴", "肏", "干你娘", "日你妈", "脑残", "死全家", "支那"),
  ...word("nmsl"),
];

/** Impersonation guards — display names only. `exact`: the whole squashed
 * name equals it; `contains`: the squashed name contains it; `prefix`: it
 * starts with it. */
export const RESERVED_NAMES = {
  exact: [
    "admin", "administrator", "moderator", "mod", "support", "staff", "official", "system", "developer",
    "dev", "owner", "creator", "gamemaster", "gm", "deletedplayer", "anonymous", "booksandruns", "booksruns",
  ],
  contains: ["booksandruns", "booksruns", "booksnruns", "bookandruns"],
  prefix: ["admin", "moderator"],
};
