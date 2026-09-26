import { describe, expect, it } from "vitest";
import en from "./dictionaries/en";
import { buildPseudoDictionary, toPseudo } from "./pseudoLocale";

describe("pseudo-locale", () => {
  it("brackets, accents and preserves {placeholders}", () => {
    expect(toPseudo("Hello {name}, you have {count} books")).toMatch(/^\[.+\{name\}.+\{count\}.+\]$/);
    expect(toPseudo("Hello")).not.toMatch(/[A-Za-z]{2}/);
  });

  it("leaves no plain-ASCII words in any converted en string (outside placeholders)", () => {
    const bad: string[] = [];
    for (const [k, v] of Object.entries(buildPseudoDictionary(en as Record<string, string>))) {
      if (v.replace(/\{\w+\}/g, "").match(/[A-Za-z]{2}/)) bad.push(k);
    }
    expect(bad).toEqual([]);
  });
});
