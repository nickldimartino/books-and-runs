"use client";

// The full release history — RELEASES (app/lib/releases.ts) rendered
// newest-first. Titles/descriptions are deliberately English-only (see that
// file's own header comment); everything else on this page is translated.

import { releasesNewestFirst } from "../lib/releases";
import { useT } from "../lib/i18n/LocaleProvider";

// `new Date("2026-09-29")` parses as UTC midnight, which prints as the
// PREVIOUS day in any timezone behind UTC (e.g. Sep 28 in US Eastern) —
// parse the y/m/d as a local date instead of letting Date read the ISO
// string as UTC.
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function ReleasesContent() {
  const { t, locale } = useT();
  const releases = releasesNewestFirst();

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("releases.title")}</h1>
        <p className="mt-1 text-sm text-[var(--faint)]">{t("releases.subtitle")}</p>
      </div>

      <ol className="flex flex-col gap-3">
        {releases.map((r) => {
          const dateLabel = parseLocalDate(r.date).toLocaleDateString(locale, { dateStyle: "medium" });
          if (r.kind === "fix") {
            return (
              <li
                key={r.version}
                id={r.version}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--panel-soft)] px-4 py-2.5 text-xs text-[var(--faint)] scroll-mt-20"
              >
                <span>{t("releases.badge.fix")}</span>
                <span className="flex items-center gap-2 font-mono">
                  <span>{dateLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>{t("releases.versionLabel", { version: r.version })}</span>
                </span>
              </li>
            );
          }
          return (
            <li
              key={r.version}
              id={r.version}
              className="flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4 shadow-sm scroll-mt-20"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                  {t("releases.badge.feature")}
                </span>
                <span className="text-xs text-[var(--faint)]">{dateLabel}</span>
                <span className="ml-auto font-mono text-[11px] text-[var(--faint)]">
                  {t("releases.versionLabel", { version: r.version })}
                </span>
              </div>
              <h2 className="text-base font-semibold text-[var(--heading)]">{r.title}</h2>
              <p className="text-sm leading-relaxed text-[var(--muted)]">{r.description}</p>
            </li>
          );
        })}
      </ol>
    </>
  );
}
