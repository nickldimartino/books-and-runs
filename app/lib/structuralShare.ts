// Structural sharing for JSON-shaped data. A multiplayer refresh returns a
// brand-new object graph even when nothing changed (or only a discard pile
// moved) — every card, meld and player would get a fresh identity, so every
// memo, effect dependency and React.memo boundary downstream sees a change.
// `shareStructure(prev, next)` returns `next`'s content but reuses `prev`'s
// object/array references wherever the two are deeply equal: an unchanged
// snapshot comes back as the *same reference* as `prev`, and a changed one
// keeps every unchanged subtree (a card, the hand array, the melds array)
// referentially stable. Plain-JSON only (objects, arrays, primitives).

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function shareStructure<T>(prev: unknown, next: T): T {
  if (prev === next) return next;
  if (Array.isArray(prev) && Array.isArray(next)) {
    let identical = prev.length === next.length;
    const out = next.map((item, i) => {
      const shared = i < prev.length ? shareStructure(prev[i], item) : item;
      if (shared !== prev[i]) identical = false;
      return shared;
    });
    return (identical ? prev : out) as unknown as T;
  }
  if (isPlainObject(prev) && isPlainObject(next)) {
    const nextKeys = Object.keys(next);
    let identical = Object.keys(prev).length === nextKeys.length;
    const out: Record<string, unknown> = {};
    for (const k of nextKeys) {
      const shared = k in prev ? shareStructure(prev[k], next[k]) : next[k];
      if (!(k in prev) || shared !== prev[k]) identical = false;
      out[k] = shared;
    }
    return (identical ? prev : out) as unknown as T;
  }
  return next;
}
