// @vitest-environment jsdom

// CardFacePicker/SignatureCardBackPicker's "Get this in the Boutique" deep
// link (see /tmp/wave/store.md): a locked Boutique-sourced style now links
// to /boutique?item=<sku> instead of being a dead button, while every other
// tile (free, or locked behind a non-Boutique requirement) keeps its
// original plain-button behavior unchanged.

import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { CardFacePicker } from "./CardFacePicker";
import { SignatureCardBackPicker } from "./SignatureCardBackPicker";
import { CARD_FACES } from "../lib/cardFaceStore";
import { SIGNATURE_CARD_BACKS } from "../lib/cardBackStore";

afterEach(cleanup);

describe("CardFacePicker — Boutique deep link", () => {
  it("a locked Boutique style is a link into /boutique?item=card_face:<id>", () => {
    const boutiqueStyle = CARD_FACES.find((f) => f.source === "boutique")!;
    render(<CardFacePicker active="classic" onSelect={vi.fn()} level={0} isCreator={false} />);
    const link = screen.getByRole("link", { name: new RegExp(boutiqueStyle.name) });
    expect(link.getAttribute("href")).toBe(`/boutique?item=card_face:${boutiqueStyle.id}`);
  });

  it("an unlocked style stays a plain, selectable button", () => {
    const onSelect = vi.fn();
    render(<CardFacePicker active="realistic" onSelect={onSelect} level={0} isCreator={false} />);
    const button = screen.getByRole("button", { name: /Classic/ });
    button.click();
    expect(onSelect).toHaveBeenCalledWith("classic");
  });

  it("a non-Boutique locked style (e.g. Foil, level-gated) has no Boutique link", () => {
    render(<CardFacePicker active="classic" onSelect={vi.fn()} level={0} isCreator={false} />);
    expect(screen.queryByRole("link", { name: /Foil/ })).toBeNull();
  });
});

describe("SignatureCardBackPicker — Boutique deep link", () => {
  it("a locked Boutique card back is a link into /boutique?item=card_back:<id>", () => {
    const boutiqueBack = SIGNATURE_CARD_BACKS.find((b) => b.source === "boutique")!;
    render(<SignatureCardBackPicker active={null} onSelect={vi.fn()} level={0} isCreator={false} />);
    const link = screen.getByRole("link", { name: new RegExp(boutiqueBack.name) });
    expect(link.getAttribute("href")).toBe(`/boutique?item=card_back:${boutiqueBack.id}`);
  });

  it("isCreator unlocks Boutique card backs back into plain buttons", () => {
    const boutiqueBack = SIGNATURE_CARD_BACKS.find((b) => b.source === "boutique")!;
    render(<SignatureCardBackPicker active={null} onSelect={vi.fn()} level={0} isCreator />);
    expect(screen.getByRole("button", { name: new RegExp(boutiqueBack.name) })).toBeTruthy();
    expect(screen.queryByRole("link", { name: new RegExp(boutiqueBack.name) })).toBeNull();
  });
});
