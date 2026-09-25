"use client";

import Link from "next/link";
import { useT } from "../lib/i18n/LocaleProvider";

export function NotFoundContent() {
  const { t } = useT();
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--faint)]">{t("notFound.eyebrow")}</p>
      <h1 className="text-2xl font-bold text-[var(--heading)]">{t("notFound.title")}</h1>
      <p className="text-sm text-[var(--muted)]">{t("notFound.body")}</p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[var(--on-accent)] shadow hover:bg-[var(--accent-hover)]"
      >
        {t("common.backToHome")}
      </Link>
    </main>
  );
}
