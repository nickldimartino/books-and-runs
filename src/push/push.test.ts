import { describe, expect, it } from "vitest";
import {
  buildPushPayload,
  categoryEnabled,
  formatHoursLeft,
  inQuietHours,
  PUSH_CATEGORY,
  PUSH_COPY,
  PUSH_LOCALES,
  pickPushLocale,
  pushText,
  PushKind,
  shouldPush,
  underFrequencyCap,
} from "../../supabase/functions/_shared/push";

const KINDS = Object.keys(PUSH_CATEGORY) as PushKind[];

describe("pickPushLocale", () => {
  it("returns supported locales as-is and folds close variants", () => {
    expect(pickPushLocale("de")).toBe("de");
    expect(pickPushLocale("pt-BR")).toBe("pt-BR");
    expect(pickPushLocale("pt")).toBe("pt-BR");
    expect(pickPushLocale("PT-br")).toBe("pt-BR");
    expect(pickPushLocale("zh-CN")).toBe("zh");
    expect(pickPushLocale("ja_JP")).toBe("ja");
  });
  it("falls back to English", () => {
    for (const v of [null, undefined, "", "xx", "tlh", "klingon", "en-GB"]) {
      expect(pickPushLocale(v as string | null | undefined)).toBe("en");
    }
  });
});

describe("copy table", () => {
  it("has every kind in every locale with non-empty title and body", () => {
    for (const l of PUSH_LOCALES) {
      for (const k of KINDS) {
        const c = PUSH_COPY[l][k];
        expect(c?.title, `${l}.${k}.title`).toBeTruthy();
        expect(c?.body, `${l}.${k}.body`).toBeTruthy();
      }
    }
  });
  it("named variants keep the same placeholders as English", () => {
    const ph = (s?: string) => [...(s ?? "").matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    for (const l of PUSH_LOCALES) {
      for (const k of KINDS) {
        expect(ph(PUSH_COPY[l][k].named), `${l}.${k}.named`).toBe(ph(PUSH_COPY.en[k].named));
        expect(ph(PUSH_COPY[l][k].body), `${l}.${k}.body`).toBe(ph(PUSH_COPY.en[k].body));
        expect(ph(PUSH_COPY[l][k].title), `${l}.${k}.title`).toBe(ph(PUSH_COPY.en[k].title));
      }
    }
  });
  it("never leaves an unfilled placeholder in the rendered text", () => {
    for (const l of PUSH_LOCALES) {
      for (const k of KINDS) {
        const t = pushText(k, l, { name: "Zara", round: 3, hours: 14, emote: "👏", streak: 5 });
        expect(t.title + t.body, `${l}.${k}`).not.toMatch(/\{\w+\}/);
        const bare = pushText(k, l, {});
        expect(bare.title + bare.body, `bare ${l}.${k}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe("pushText personalisation", () => {
  it("uses the opponent name and round when known, generic otherwise", () => {
    expect(pushText("your_turn", "en", { name: "Zara", round: 3 }).body).toBe("Zara played — round 3, your move.");
    expect(pushText("your_turn", "en", {}).body).toBe("It's your move in Books & Runs.");
    // round unknown → the generic body rather than a dangling placeholder
    expect(pushText("your_turn", "en", { name: "Zara" }).body).toBe("It's your move in Books & Runs.");
    expect(pushText("nudge", "de", { name: "Zara" }).body).toBe("Zara wartet auf deinen Zug.");
  });
  it("localises by the recipient's saved language", () => {
    expect(pushText("game_request", "fr", { name: "Zara" }).title).toBe("Invitation à une partie");
    expect(pushText("your_turn", "ja", { name: "Zara", round: 2 }).body).toContain("Zara");
    expect(pushText("your_turn", "zz", {}).title).toBe("Your turn");
  });
  it("strips control and bidi characters from names and caps the length", () => {
    const t = pushText("nudge", "en", { name: "‮Zara\u0007" + "x".repeat(100) });
    expect(t.body).not.toMatch(/[‮\u0007]/);
    expect(t.body.length).toBeLessThan(80);
  });
  it("formats the time left with locale units", () => {
    expect(formatHoursLeft(14, "en")).toBe("14 hours");
    expect(formatHoursLeft(0.2, "en")).toBe("1 hour");
    expect(formatHoursLeft(72, "en")).toBe("3 days");
    expect(pushText("turn_warning", "en", { hours: 18 }).body).toBe("You have 18 hours left to play your turn.");
  });
});

describe("buildPushPayload", () => {
  it("deep-links game pushes and tags them per game", () => {
    const p = buildPushPayload("your_turn", "en", { name: "Zara", round: 2 }, "g-1");
    expect(p.url).toBe("/multiplayer/play?g=g-1");
    expect(p.tag).toBe("mp-g-1");
  });
  it("routes friend and streak pushes to the right page", () => {
    expect(buildPushPayload("friend_request", "en", { name: "Z" }, null).url).toBe("/friends");
    expect(buildPushPayload("streak_daily", "en", { streak: 3 }, null)).toMatchObject({ url: "/", tag: "streak_daily" });
  });
});

describe("preferences", () => {
  it("defaults every category on, and honours explicit off", () => {
    expect(categoryEnabled(null, "turns")).toBe(true);
    expect(categoryEnabled({}, "streaks")).toBe(true);
    expect(categoryEnabled({ notify_turns: null }, "turns")).toBe(true);
    expect(categoryEnabled({ notify_turns: false }, "turns")).toBe(false);
    expect(categoryEnabled({ notify_turns: false }, "invites")).toBe(true);
  });
  it("maps every kind to a category", () => {
    expect(PUSH_CATEGORY.nudge).toBe("nudges");
    expect(PUSH_CATEGORY.game_request).toBe("invites");
    expect(PUSH_CATEGORY.streak_weekly).toBe("streaks");
    expect(PUSH_CATEGORY.turn_warning).toBe("turns");
  });
});

describe("inQuietHours", () => {
  // 2026-09-25T03:30:00Z
  const utc = Date.UTC(2026, 8, 25, 3, 30);
  it("is off when unset, degenerate, or the offset is unknown", () => {
    expect(inQuietHours(null, utc)).toBe(false);
    expect(inQuietHours({ quiet_hours_start: 22, quiet_hours_end: 8 }, utc)).toBe(false); // no tz
    expect(inQuietHours({ quiet_hours_start: 5, quiet_hours_end: 5, tz_offset_minutes: 0 }, utc)).toBe(false);
    expect(inQuietHours({ quiet_hours_start: 22, quiet_hours_end: null, tz_offset_minutes: 0 }, utc)).toBe(false);
  });
  it("handles a window that wraps midnight, in the recipient's local time", () => {
    const prefs = { quiet_hours_start: 22, quiet_hours_end: 8 };
    expect(inQuietHours({ ...prefs, tz_offset_minutes: 0 }, utc)).toBe(true); // 03:30 local
    expect(inQuietHours({ ...prefs, tz_offset_minutes: 9 * 60 }, utc)).toBe(false); // 12:30 in Tokyo
    expect(inQuietHours({ ...prefs, tz_offset_minutes: -5 * 60 }, utc)).toBe(true); // 22:30 previous evening
    expect(inQuietHours({ ...prefs, tz_offset_minutes: -4 * 60 }, utc)).toBe(true); // 23:30 previous evening
    expect(inQuietHours({ ...prefs, tz_offset_minutes: 6 * 60 }, utc)).toBe(false); // 09:30 local
  });
  it("treats the window as [start, end) and handles same-day windows", () => {
    const same = { quiet_hours_start: 13, quiet_hours_end: 15, tz_offset_minutes: 0 };
    expect(inQuietHours(same, Date.UTC(2026, 8, 25, 13, 0))).toBe(true);
    expect(inQuietHours(same, Date.UTC(2026, 8, 25, 14, 59))).toBe(true);
    expect(inQuietHours(same, Date.UTC(2026, 8, 25, 15, 0))).toBe(false);
    expect(inQuietHours(same, Date.UTC(2026, 8, 25, 12, 59))).toBe(false);
  });
  it("rejects out-of-range garbage instead of silencing everything", () => {
    expect(inQuietHours({ quiet_hours_start: 25, quiet_hours_end: 3, tz_offset_minutes: 0 }, utc)).toBe(false);
    expect(inQuietHours({ quiet_hours_start: 1, quiet_hours_end: 6, tz_offset_minutes: 99999 }, utc)).toBe(false);
    expect(inQuietHours({ quiet_hours_start: 1.5, quiet_hours_end: 6, tz_offset_minutes: 0 }, utc)).toBe(false);
  });
});

describe("shouldPush / frequency cap", () => {
  const utc = Date.UTC(2026, 8, 25, 3, 30);
  it("category off wins, then quiet hours, else send", () => {
    expect(shouldPush({ notify_nudges: false }, "nudge", utc)).toBe("category_off");
    expect(shouldPush({ quiet_hours_start: 0, quiet_hours_end: 6, tz_offset_minutes: 0 }, "your_turn", utc)).toBe("quiet_hours");
    expect(shouldPush({}, "your_turn", utc)).toBe("send");
  });
  it("caps pushes per hour", () => {
    expect(underFrequencyCap(0)).toBe(true);
    expect(underFrequencyCap(7)).toBe(true);
    expect(underFrequencyCap(8)).toBe(false);
    expect(underFrequencyCap(3, 3)).toBe(false);
  });
});
