"use client";

// Gamepad support for the whole app, mounted once in the root layout.
//
//  - D-pad / left stick: spatial focus movement between every focusable
//    control (a lightweight spatial-navigation layer — no per-page wiring).
//    Inside an open modal (aria-modal) focus stays in that modal.
//  - A = activate the focused control, B = Escape (close/back),
//    X = draw (D), Y = sort (S), LT = group/confirm/lay off (M), RT = discard,
//    Back/View = undo (U), Start = shortcut help (?), LB/RB = jump between
//    the table's zones (elements tagged data-nav-zone).
//  - The game shortcuts are triggered by dispatching the same key events the
//    keyboard produces, so useGameShortcuts needs no gamepad-specific code.
//  - On-screen button prompts appear only while a pad is connected, and the
//    <html data-input="gamepad"> attribute switches focus rings to their
//    bold "10-foot" style (globals.css). Any real mouse/touch/key press
//    drops back to the normal look.
//
// Touch and mouse are untouched: nothing here runs until a gamepad connects.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { pickNext, type NavDir } from "../lib/spatialNav";
import { useT } from "../lib/i18n/LocaleProvider";

const FOCUSABLE =
  'a[href], button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const STICK_THRESHOLD = 0.55;
const REPEAT_FIRST_MS = 340;
const REPEAT_NEXT_MS = 120;

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  if (el.closest('[aria-hidden="true"], [inert]')) return false;
  const style = getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none";
}

/** The container focus is confined to: the last open modal, else the page. */
function navRoot(): ParentNode {
  const modals = document.querySelectorAll<HTMLElement>('[aria-modal="true"]');
  return modals.length > 0 ? modals[modals.length - 1] : document;
}

function candidates(): HTMLElement[] {
  return Array.from(navRoot().querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

function moveFocus(dir: NavDir): void {
  const active = document.activeElement as HTMLElement | null;
  const list = candidates();
  if (list.length === 0) return;
  const inRoot = active && active !== document.body && list.includes(active) ? active : null;
  if (!inRoot) {
    // Nothing (valid) focused yet: land on the first control in the viewport.
    const first = list.find((el) => el.getBoundingClientRect().bottom > 0) ?? list[0];
    first.focus();
    return;
  }
  // Range sliders: left/right adjust the value instead of moving away.
  if (inRoot instanceof HTMLInputElement && inRoot.type === "range" && (dir === "left" || dir === "right")) {
    if (dir === "right") inRoot.stepUp();
    else inRoot.stepDown();
    inRoot.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const from = inRoot.getBoundingClientRect();
  const next = pickNext(
    from,
    list.filter((el) => el !== inRoot).map((el) => ({ item: el, rect: el.getBoundingClientRect() })),
    dir
  );
  if (next) {
    next.focus({ preventScroll: true });
    next.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function fireKey(key: string): void {
  const target: EventTarget = document.activeElement && document.activeElement !== document.body ? document.activeElement : document;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function activate(): void {
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body) {
    moveFocus("down");
    return;
  }
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "A" || tag === "INPUT" || tag === "LABEL" || tag === "SUMMARY") {
    el.click();
  } else if (tag === "SELECT") {
    el.click();
  } else {
    // role="button" divs (the hand's cards) select via Enter, not click.
    fireKey("Enter");
  }
}

let zoneIndex = -1;
function cycleZone(delta: 1 | -1): void {
  const zones = Array.from(navRoot().querySelectorAll<HTMLElement>("[data-nav-zone]")).filter(isVisible);
  if (zones.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  const current = zones.findIndex((z) => active && z.contains(active));
  zoneIndex = (current === -1 ? (delta === 1 ? -1 : 0) : current) + delta;
  zoneIndex = (zoneIndex + zones.length) % zones.length;
  const zone = zones[zoneIndex];
  const target = zone.matches(FOCUSABLE) ? zone : zone.querySelector<HTMLElement>(FOCUSABLE);
  target?.focus({ preventScroll: true });
  (target ?? zone).scrollIntoView({ block: "nearest", behavior: "auto" });
}

// Standard-mapping button indices.
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export function GamepadNavigation() {
  const { t } = useT();
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);
  const prevPressed = useRef<boolean[]>([]);
  const held = useRef<{ dir: NavDir | null; next: number }>({ dir: null, next: 0 });

  // Connection tracking.
  useEffect(() => {
    const anyPad = () => Array.from(navigator.getGamepads?.() ?? []).some((g) => !!g);
    const onConn = () => setConnected(true);
    const onDisc = () => setConnected(anyPad());
    window.addEventListener("gamepadconnected", onConn);
    window.addEventListener("gamepaddisconnected", onDisc);
    if (anyPad()) setConnected(true);
    return () => {
      window.removeEventListener("gamepadconnected", onConn);
      window.removeEventListener("gamepaddisconnected", onDisc);
    };
  }, []);

  // Polling loop — only while a pad is connected.
  useEffect(() => {
    if (!connected) {
      document.documentElement.removeAttribute("data-input");
      return;
    }
    let raf = 0;
    const setPadMode = () => document.documentElement.setAttribute("data-input", "gamepad");
    const setPointerMode = (e: Event) => {
      if (e.isTrusted) document.documentElement.removeAttribute("data-input");
    };
    window.addEventListener("pointerdown", setPointerMode);
    window.addEventListener("keydown", setPointerMode);

    function poll(now: number) {
      raf = requestAnimationFrame(poll);
      const pad = Array.from(navigator.getGamepads?.() ?? []).find((g) => g && g.connected);
      if (!pad) return;
      const pressed = pad.buttons.map((b) => b.pressed);
      const prev = prevPressed.current;
      const edge = (i: number) => pressed[i] && !prev[i];
      let used = pressed.some(Boolean);

      // Direction: D-pad wins over the stick.
      let dir: NavDir | null = null;
      if (pressed[BTN.UP]) dir = "up";
      else if (pressed[BTN.DOWN]) dir = "down";
      else if (pressed[BTN.LEFT]) dir = "left";
      else if (pressed[BTN.RIGHT]) dir = "right";
      else {
        const x = pad.axes[0] ?? 0;
        const y = pad.axes[1] ?? 0;
        if (Math.max(Math.abs(x), Math.abs(y)) > STICK_THRESHOLD) {
          dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
        }
      }
      if (dir) {
        used = true;
        if (held.current.dir !== dir) {
          held.current = { dir, next: now + REPEAT_FIRST_MS };
          setPadMode();
          moveFocus(dir);
        } else if (now >= held.current.next) {
          held.current.next = now + REPEAT_NEXT_MS;
          moveFocus(dir);
        }
      } else {
        held.current = { dir: null, next: 0 };
      }

      if (used) setPadMode();
      if (edge(BTN.A)) activate();
      if (edge(BTN.B)) fireKey("Escape");
      if (edge(BTN.X)) fireKey("d");
      if (edge(BTN.Y)) fireKey("s");
      if (edge(BTN.LT)) fireKey("m");
      if (edge(BTN.RT)) fireKey("Delete");
      if (edge(BTN.BACK)) fireKey("u");
      if (edge(BTN.START)) fireKey("?");
      if (edge(BTN.LB)) cycleZone(-1);
      if (edge(BTN.RB)) cycleZone(1);
      prevPressed.current = pressed;
    }
    raf = requestAnimationFrame(poll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointerdown", setPointerMode);
      window.removeEventListener("keydown", setPointerMode);
    };
  }, [connected]);

  if (!connected) return null;
  const inGame = pathname.startsWith("/game") || pathname.startsWith("/multiplayer/play");

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-2 left-1/2 z-[120] flex max-w-[96vw] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-[var(--border)] bg-[var(--panel)]/95 px-4 py-1.5 text-xs text-[var(--muted)] shadow-lg backdrop-blur"
      data-testid="gamepad-prompts"
    >
      <Prompt pad="A" label={t("gamepad.select")} />
      <Prompt pad="B" label={t("gamepad.back")} />
      {inGame && (
        <>
          <Prompt pad="X" label={t("gamepad.draw")} />
          <Prompt pad="Y" label={t("gamepad.sort")} />
          <Prompt pad="LB/RB" label={t("gamepad.zones")} />
          <Prompt pad="☰" label={t("gamepad.help")} />
        </>
      )}
    </div>
  );
}

function Prompt({ pad, label }: { pad: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="grid min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-bold leading-5 text-[var(--on-accent)]">
        {pad}
      </span>
      {label}
    </span>
  );
}
