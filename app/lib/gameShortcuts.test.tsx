import { describe, expect, it } from "vitest";
import { isTypingTarget, matchShortcut } from "./gameShortcuts";

describe("matchShortcut", () => {
  it("maps the documented keys", () => {
    expect(matchShortcut({ key: "d" })).toBe("draw");
    expect(matchShortcut({ key: "D", shiftKey: true })).toBe("drawDiscard");
    expect(matchShortcut({ key: "f" })).toBe("drawDiscard");
    expect(matchShortcut({ key: "s" })).toBe("sortRank");
    expect(matchShortcut({ key: "S", shiftKey: true })).toBe("sortSuit");
    expect(matchShortcut({ key: "m" })).toBe("group");
    expect(matchShortcut({ key: "Delete" })).toBe("discard");
    expect(matchShortcut({ key: "Backspace" })).toBe("discard");
    expect(matchShortcut({ key: "?", shiftKey: true })).toBe("help");
    expect(matchShortcut({ key: "Escape" })).toBe("escape");
  });

  it("treats Ctrl/Cmd+Z as undo and ignores other modified keys", () => {
    expect(matchShortcut({ key: "z", ctrlKey: true })).toBe("undo");
    expect(matchShortcut({ key: "z", metaKey: true })).toBe("undo");
    expect(matchShortcut({ key: "d", ctrlKey: true })).toBeNull();
    expect(matchShortcut({ key: "d", altKey: true })).toBeNull();
  });

  it("ignores key repeat and unbound keys", () => {
    expect(matchShortcut({ key: "d", repeat: true })).toBeNull();
    expect(matchShortcut({ key: "q" })).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("is true for text fields and false for buttons", () => {
    const input = document.createElement("input");
    input.type = "text";
    const area = document.createElement("textarea");
    const btn = document.createElement("button");
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(area)).toBe(true);
    expect(isTypingTarget(btn)).toBe(false);
    expect(isTypingTarget(box)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
