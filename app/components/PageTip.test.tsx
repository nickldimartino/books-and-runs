// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageTip } from "./PageTip";
import { isTipSeen } from "../lib/tipsStore";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("PageTip", () => {
  it("shows an unseen tip", async () => {
    render(
      <PageTip id="home" title="Welcome">
        Body text
      </PageTip>
    );
    expect(await screen.findByText("Welcome")).toBeTruthy();
    expect(screen.getByText("Body text")).toBeTruthy();
  });

  it("renders nothing for an already-seen tip", async () => {
    window.localStorage.setItem("booksAndRuns:seenTips", JSON.stringify(["home"]));
    render(
      <PageTip id="home" title="Welcome">
        Body text
      </PageTip>
    );
    await waitFor(() => expect(screen.queryByText("Welcome")).toBeNull());
  });

  it("dismissing hides it and marks it seen for next time", async () => {
    const user = userEvent.setup();
    render(
      <PageTip id="new-game" title="Pick your pace">
        Body text
      </PageTip>
    );
    await screen.findByText("Pick your pace");
    expect(isTipSeen("new-game")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Dismiss tip" }));

    expect(screen.queryByText("Pick your pace")).toBeNull();
    expect(isTipSeen("new-game")).toBe(true);
  });
});
