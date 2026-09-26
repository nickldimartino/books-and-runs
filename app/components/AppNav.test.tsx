// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AppNav } from "./AppNav";

let pathname = "/";
let counts = { friendRequests: 0, gameRequests: 0, yourTurn: 0 };
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("../lib/NotificationsContext", () => ({
  useSharedNotifications: () => ({ ...counts, total: 0, mpGames: [], loading: false, refresh: () => {} }),
}));

afterEach(() => {
  cleanup();
  pathname = "/";
  counts = { friendRequests: 0, gameRequests: 0, yourTurn: 0 };
});

describe("AppNav", () => {
  it("is a labelled navigation landmark with four tabs, the current one aria-current", () => {
    pathname = "/friends";
    render(<AppNav />);
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/", "/progress", "/social", "/profile"]);
    const current = links.filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/social");
  });

  it("renders nothing on screens where the nav is hidden", () => {
    for (const p of ["/game", "/multiplayer/play", "/new-game/local", "/sign-in", "/reset-password"]) {
      pathname = p;
      const { container, unmount } = render(<AppNav />);
      expect(container.querySelector("nav"), p).toBeNull();
      unmount();
    }
  });

  it("badges Social with friend requests and Play with waiting games + invites", () => {
    counts = { friendRequests: 3, gameRequests: 1, yourTurn: 2 };
    render(<AppNav />);
    expect(screen.getByTestId("nav-badge-social").textContent).toContain("3");
    expect(screen.getByTestId("nav-badge-play").textContent).toContain("3");
    expect(screen.queryByTestId("nav-badge-progress")).toBeNull();
    // An accessible count, not just a dot.
    expect(screen.getAllByText("3 new", { selector: ".sr-only" })).toHaveLength(2);
  });

  it("caps big counts at 9+ and shows no badge for zero", () => {
    counts = { friendRequests: 12, gameRequests: 0, yourTurn: 0 };
    render(<AppNav />);
    expect(screen.getByTestId("nav-badge-social").textContent).toContain("9+");
    expect(screen.queryByTestId("nav-badge-play")).toBeNull();
  });
});
