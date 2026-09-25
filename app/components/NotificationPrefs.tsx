"use client";

// Settings → General → Notifications: which kinds of push to receive, and
// quiet hours. Stored locally + synced to the account (migration 0062); the
// server enforces them when it sends (supabase/functions/_shared/push.ts).

import { useT } from "../lib/i18n/LocaleProvider";
import type { TranslationKey } from "../lib/i18n/keys";
import type { HouseSettings } from "../lib/settingsStore";

const CATEGORIES: { key: "notifyTurns" | "notifyInvites" | "notifyNudges" | "notifyStreaks"; label: TranslationKey; hint: TranslationKey }[] = [
  { key: "notifyTurns", label: "settings.notify.turns", hint: "settings.notify.turnsHint" },
  { key: "notifyInvites", label: "settings.notify.invites", hint: "settings.notify.invitesHint" },
  { key: "notifyNudges", label: "settings.notify.nudges", hint: "settings.notify.nudgesHint" },
  { key: "notifyStreaks", label: "settings.notify.streaks", hint: "settings.notify.streaksHint" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(h: number, locale: string): string {
  try {
    return new Date(2026, 0, 1, h).toLocaleTimeString(locale, { hour: "numeric" });
  } catch {
    return `${h}:00`;
  }
}

export function NotificationPrefs({
  settings,
  onChange,
}: {
  settings: HouseSettings;
  onChange: (patch: Partial<HouseSettings>) => void;
}) {
  const { t, locale } = useT();
  const selectCls =
    "rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)] disabled:opacity-50";
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-[var(--border)] pt-3">
      <p className="text-sm font-medium text-[var(--heading)]">{t("settings.notify.heading")}</p>
      {CATEGORIES.map((c) => (
        <label key={c.key} className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm text-[var(--heading)]">{t(c.label)}</span>
            <span className="block text-xs text-[var(--faint)]">{t(c.hint)}</span>
          </span>
          <input
            type="checkbox"
            checked={settings[c.key]}
            onChange={(e) => onChange({ [c.key]: e.target.checked })}
            className="h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
        </label>
      ))}
      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm text-[var(--heading)]">{t("settings.notify.quietHours")}</span>
            <span className="block text-xs text-[var(--faint)]">{t("settings.notify.quietHoursHint")}</span>
          </span>
          <input
            type="checkbox"
            checked={settings.quietHoursEnabled}
            onChange={(e) =>
              onChange({
                quietHoursEnabled: e.target.checked,
                quietHoursStart: settings.quietHoursStart,
                quietHoursEnd: settings.quietHoursEnd,
              })
            }
            className="h-5 w-5 shrink-0 accent-[var(--accent)]"
          />
        </label>
        {settings.quietHoursEnabled && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
            <select
              aria-label={t("settings.notify.from")}
              value={settings.quietHoursStart}
              onChange={(e) =>
                onChange({ quietHoursEnabled: true, quietHoursStart: Number(e.target.value), quietHoursEnd: settings.quietHoursEnd })
              }
              className={selectCls}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h, locale)}
                </option>
              ))}
            </select>
            <span>{t("settings.notify.to")}</span>
            <select
              aria-label={t("settings.notify.to")}
              value={settings.quietHoursEnd}
              onChange={(e) =>
                onChange({ quietHoursEnabled: true, quietHoursEnd: Number(e.target.value), quietHoursStart: settings.quietHoursStart })
              }
              className={selectCls}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h, locale)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
