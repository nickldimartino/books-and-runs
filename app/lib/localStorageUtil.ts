// The SSR-guard + try/catch shape every local-only store in this app needs
// around raw localStorage access — `typeof window === "undefined"` (this
// app's pages render once server-side before hydrating) and a browser that
// throws on read/write (private-mode Safari, storage disabled, quota full).
// Deliberately just string in/string out: JSON parsing, default values, and
// validating a stored value against a store's own known-option list all stay
// with each caller (same tradeoff `mpSchema.ts`'s Zod parsing makes one
// layer up) — this only removes the ~6-line boilerplate around the actual
// browser call, which was previously hand-copied into every store file.

export function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns whether the write actually landed — false on a browser that
 * throws (private-mode Safari, quota full, storage disabled), never thrown. */
export function writeLocalStorage(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // storage unavailable — nothing to clean up
  }
}
