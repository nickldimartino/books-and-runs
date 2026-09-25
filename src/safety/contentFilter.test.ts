import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BLOCKED_TERMS } from "./blocklist";
import {
  ACCENT_FROM,
  ACCENT_TO,
  checkBio,
  checkDisplayName,
  checkTitle,
  compiledBlocklist,
  compiledReserved,
  foldText,
  formsOf,
  LEET_FROM,
  LEET_TO,
} from "./contentFilter";

describe("foldText / formsOf", () => {
  it("accent and leet tables are index-aligned", () => {
    expect([...ACCENT_FROM].length).toBe([...ACCENT_TO].length);
    expect(LEET_FROM.length).toBe(LEET_TO.length);
  });
  it("folds accents, leet and full-width forms", () => {
    expect(foldText("Ñandú")).toBe("nandu");
    expect(foldText("Ｓｈ1ｔ")).toBe("shit");
    expect(foldText("Straße")).toBe("strasse");
    expect(foldText("Ёлка")).toBe("елка");
  });
  it("stretches are cut down", () => {
    const f = formsOf("fuuuuuck");
    expect(f.squash).toBe("fuuck");
    expect(f.squashLoose).toBe("fuck");
  });
});

describe("checkDisplayName — accepts ordinary names", () => {
  const fine = [
    "Nick", "Sarah Jane", "Ace_of_Spades", "Player 4821", "Nigeria", "Niger", "Assassin", "Cocktail", "Scunthorpe",
    "Classic", "Grape", "Fickle", "Nutter", "Maricarmen", "Computation", "Дмитрий", "山田太郎", "김민수", "王小明",
    "Mia the Wanderer", "Dev Patel", "Hancock", "Shiitake", "Peacock", "Jose Nuñez", "Zoë", "Kitchen Pro",
  ];
  it.each(fine)("%s", (name) => {
    expect(checkDisplayName(name)).toEqual({ ok: true });
  });
});

describe("checkDisplayName — rejects", () => {
  it("profanity across languages, with evasion", () => {
    const bad = [
      "fuck", "FUCKER99", "f.u.c.k", "sh1t", "$hit", "fuuuuck", "b1tch", "d1ck", "cunt", "N1gger", "nigg@",
      "Motherfucker", "puta", "hijueputa", "connard", "Scheiße", "Arschloch", "vaffanculo", "caralho", "хуй", "Пизда",
      "blyat", "死ね", "ファック", "씨발", "傻逼", "他妈的",
    ];
    for (const name of bad) expect(checkDisplayName(name), name).toEqual({ ok: false, issue: "profanity" });
  });
  it("staff impersonation", () => {
    for (const name of ["Admin", "a d m i n", "4dmin", "Moderator Mike", "Books & Runs", "BooksAndRuns Support", "Deleted Player", "support"]) {
      expect(checkDisplayName(name), name).toEqual({ ok: false, issue: "impersonation" });
    }
  });
  it("blank names and links", () => {
    expect(checkDisplayName("   ")).toEqual({ ok: false, issue: "empty" });
    expect(checkDisplayName("visit www.spam.com")).toEqual({ ok: false, issue: "link" });
    expect(checkDisplayName("me@example.com")).toEqual({ ok: false, issue: "link" });
  });
});

describe("spaced / separator-obfuscated words", () => {
  it("catches spelled-out profanity, with or without a glued leading article", () => {
    for (const t of ["f u c k", "f.u.c.k", "f-u-c-k", "f_u_c_k", "you are a f u c k", "i f-u-c-k", "a s h i t", "what a f.u.c.k.i.n.g mess"]) {
      expect(checkBio(t), t).toEqual({ ok: false, issue: "profanity" });
    }
  });
  it("does not flag initials, short names or innocent spaced letters", () => {
    for (const t of ["J. R. R. Tolkien fan", "A. J. Smith", "I am a big fan", "a b c d", "Q. E. D.", "I O U", "Ms. A. B. Chen", "a s s ociate"]) {
      expect(checkBio(t).ok, t).toBe(true);
    }
  });
});

describe("checkBio / checkTitle", () => {
  it("allows empty bios (clearing) and normal text, even 'admin' talk", () => {
    expect(checkBio("")).toEqual({ ok: true });
    expect(checkBio("I love a good run of 7s. Club admin on weekends!")).toEqual({ ok: true });
  });
  it("rejects profanity and links in bios", () => {
    expect(checkBio("what the fuck")).toEqual({ ok: false, issue: "profanity" });
    expect(checkBio("add me https://x.gg/abc")).toEqual({ ok: false, issue: "link" });
  });
  it("titles behave like names", () => {
    expect(checkTitle("Friday Night Rummy")).toEqual({ ok: true });
    expect(checkTitle("Admin Club")).toEqual({ ok: false, issue: "impersonation" });
    expect(checkTitle("shit club")).toEqual({ ok: false, issue: "profanity" });
    expect(checkTitle("")).toEqual({ ok: false, issue: "empty" });
  });
});

describe("blocklist sanity", () => {
  it("every entry survives normalisation as a non-empty term", () => {
    for (const b of BLOCKED_TERMS) expect(formsOf(b.term).squash.length, b.term).toBeGreaterThan(0);
  });
  it("sub-mode terms are long enough not to hit across word boundaries", () => {
    for (const b of BLOCKED_TERMS.filter((x) => x.mode === "sub" && /^[a-z]+$/.test(x.term))) {
      expect(b.term.length, b.term).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("database mirror (migration 0060)", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/0060_blocks_reports_content_filter.sql", import.meta.url), "utf8");
  it("contains every compiled term with its mode", () => {
    for (const c of compiledBlocklist()) {
      expect(sql, `${c.mode}:${c.term}`).toContain(`('${c.term.replace(/'/g, "''")}', '${c.loose.replace(/'/g, "''")}', '${c.mode}')`);
    }
  });
  it("contains every reserved (impersonation) term", () => {
    for (const c of compiledReserved()) {
      expect(sql, `${c.mode}:${c.term}`).toContain(`('${c.term}', '${c.term}', '${c.mode}')`);
    }
  });
  it("uses the same accent and leet tables", () => {
    expect(sql).toContain(ACCENT_FROM);
    expect(sql).toContain(ACCENT_TO);
    expect(sql).toContain(LEET_FROM);
    expect(sql).toContain(LEET_TO);
  });
});
