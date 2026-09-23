import { useEffect, useState } from "react";
import { onAccountSettingsSynced } from "./accountSettingsSync";

/**
 * The "load from local storage, then re-load whenever the account settings
 * sync pulls something new down" effect every Theme/Card face/Ambient song
 * settings subpage repeats on its own — see accountSettingsSync.ts's own
 * doc (the SYNCED_EVENT half). Returns the current value, a setter for
 * optimistic local updates (call it alongside saveLocalX/pushX in a
 * handleChange, same as before this was shared), and whether the initial
 * load has happened yet (page.tsx's own <LoadingSpinner /> gate).
 *
 * `T` doesn't have to be a single primitive — Card back and Ambient song's
 * own pages each reload *two* things from the same sync event (their own
 * choice plus one read-only value they need but never set themselves:
 * the current theme, and whether ambient music is even on), so their
 * `load` just returns a small object instead.
 */
export function useSyncedLocalPreference<T>(load: () => T): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(load);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setValue(load());
    setLoading(false);
    return onAccountSettingsSynced(() => setValue(load()));
    // Deliberately only on mount, like every page this replaces — `load`
    // is a fresh closure each render but is only ever called from the
    // effect itself (on mount) or the sync callback, never re-subscribed
    // when it changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return [value, setValue, loading];
}
