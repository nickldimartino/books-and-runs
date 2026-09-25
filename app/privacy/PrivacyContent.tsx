"use client";

// All of Privacy Policy's translated prose, split out of page.tsx so that
// file can stay a Server Component for its metadata export (same pattern as
// app/how-to-play/HowToPlayContent.tsx — see its own comment).

import Link from "next/link";
import { useT } from "../lib/i18n/LocaleProvider";

export function PrivacyContent() {
  const { t } = useT();

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("privacy.title")}</h1>
        <p className="mt-1 text-sm text-[var(--faint)]">{t("privacy.lastUpdated")}</p>
      </div>

      <div className="flex flex-col gap-5 text-sm leading-relaxed text-[var(--muted)]">
        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.overview.title")}</h2>
          <p>{t("privacy.overview.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.controller.title")}</h2>
          <p>{t("privacy.controller.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.localPlay.title")}</h2>
          <p>{t("privacy.localPlay.body")}</p>
          <p className="mt-2">{t("privacy.localPlay.diagnostics")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.account.title")}</h2>
          <p className="mb-2">{t("privacy.account.intro")}</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>{t("privacy.account.item.email")}</li>
            <li>{t("privacy.account.item.stats")}</li>
            <li>{t("privacy.account.item.history")}</li>
            <li>{t("privacy.account.item.achievements")}</li>
            <li>{t("privacy.account.item.displayName")}</li>
            <li>
              {t("privacy.account.item.friendsPrefix")}{" "}
              <span className="text-[var(--heading)]">{t("privacy.account.item.friendCodeLabel")}</span>{" "}
              {t("privacy.account.item.friendsSuffix")}
            </li>
            <li>{t("privacy.account.item.profile")}</li>
            <li>{t("privacy.account.item.saves")}</li>
            <li>{t("privacy.account.item.clubs")}</li>
            <li>{t("privacy.account.item.multiplayer")}</li>
            <li>{t("privacy.account.item.aiDifficulty")}</li>
            <li>{t("privacy.account.item.push")}</li>
            <li>{t("privacy.account.item.support")}</li>
            <li>{t("privacy.account.item.security")}</li>
          </ul>
          <p className="mt-2">{t("privacy.account.outro")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.processors.title")}</h2>
          <p>
            {t("privacy.processors.bodyPrefix")}{" "}
            <a
              href="https://supabase.com/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[var(--heading)]"
            >
              {t("privacy.processors.linkText")}
            </a>
            {t("privacy.processors.bodySuffix")}
          </p>
          <p className="mt-2">{t("privacy.processors.others")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.legalBases.title")}</h2>
          <p>{t("privacy.legalBases.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.storage.title")}</h2>
          <p>{t("privacy.storage.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.export.title")}</h2>
          <p>
            {t("privacy.export.bodyPrefix")}{" "}
            <span className="text-[var(--heading)]">{t("privacy.export.downloadLabel")}</span>{" "}
            {t("privacy.export.bodyMiddle")}{" "}
            <span className="text-[var(--heading)]">nick.l.dimartino@icloud.com</span>{" "}
            {t("privacy.export.bodySuffix")}
          </p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.retention.title")}</h2>
          <p>{t("privacy.retention.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.transfers.title")}</h2>
          <p>{t("privacy.transfers.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.rights.title")}</h2>
          <p>{t("privacy.rights.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.children.title")}</h2>
          <p>{t("privacy.children.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("privacy.changes.title")}</h2>
          <p>{t("privacy.changes.body")}</p>
        </section>

        <section>
          <h2 className="mb-1 text-base font-semibold text-[var(--heading)]">{t("common.contact")}</h2>
          <p>
            {t("privacy.contact.body")}{" "}
            <span className="text-[var(--heading)]">nick.l.dimartino@icloud.com</span>.
          </p>
        </section>
      </div>

      <Link href="/" className="text-sm text-[var(--faint)] hover:text-[var(--text)]">
        {t("common.backToHome")}
      </Link>
    </>
  );
}
