"use client";

// React 19 clears any attribute on <html> that it doesn't render itself when
// it hydrates — so everything public/init.js stamped there before first paint
// (data-intro, data-seen-tips, data-started, data-signed-in,
// data-reduce-motion, …) vanishes ~60 ms later. That cut the first-visit
// intro short, re-showed dismissed page tips, and hid Home's Quests card.
// init.js snapshots its attributes on window.__brHtmlAttrs; this puts back
// whatever went missing in a layout effect — the same commit as the wipe, so
// before the browser paints — and only what is *missing*, so anything React
// or an effect has legitimately set since keeps its value. It is mounted
// first in <body>, so its layout effect runs before any other component's.

import { useLayoutEffect } from "react";

declare global {
  interface Window {
    __brHtmlAttrs?: Record<string, string>;
  }
}

export function restoreHtmlAttrs(
  snapshot: Record<string, string> | undefined,
  html: HTMLElement = document.documentElement
): void {
  if (!snapshot) return;
  for (const [name, value] of Object.entries(snapshot)) {
    if (name === "lang" || name === "class" || name === "style") continue;
    if (!html.hasAttribute(name)) html.setAttribute(name, value);
  }
}

export function HtmlAttrsRestore() {
  useLayoutEffect(() => {
    restoreHtmlAttrs(window.__brHtmlAttrs);
  }, []);
  return null;
}
