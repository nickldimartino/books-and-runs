// Vitest setup for the jsdom "app" project — stubs the browser APIs the app
// pokes on mount that jsdom doesn't implement (storage, audio, matchMedia,
// scrollTo, vibration). Only the React component tests use this.

import { vi } from "vitest";

// jsdom in this setup doesn't expose Web Storage — give it a plain
// in-memory implementation so localSave / settingsStore / etc. work.
if (typeof window.localStorage === "undefined") {
  class MemoryStorage implements Storage {
    private m = new Map<string, string>();
    get length() {
      return this.m.size;
    }
    clear() {
      this.m.clear();
    }
    getItem(k: string) {
      return this.m.has(k) ? this.m.get(k)! : null;
    }
    key(i: number) {
      return [...this.m.keys()][i] ?? null;
    }
    removeItem(k: string) {
      this.m.delete(k);
    }
    setItem(k: string, v: string) {
      this.m.set(k, String(v));
    }
  }
  Object.defineProperty(window, "localStorage", { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(window, "sessionStorage", { value: new MemoryStorage(), configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: window.localStorage, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: window.sessionStorage, configurable: true });
}

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
if (!window.scrollTo) window.scrollTo = vi.fn();
// sound.ts constructs one lazily; a bare stub is enough for tests.
window.AudioContext =
  window.AudioContext ?? (vi.fn() as unknown as typeof window.AudioContext);
if (!navigator.vibrate) {
  Object.defineProperty(navigator, "vibrate", { value: vi.fn(), configurable: true });
}
