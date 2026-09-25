"use client";

// Account page → "Delete your account". Three deliberate steps so it can't be
// done by accident on an already-unlocked device: (1) open the panel, (2) type
// the confirmation word AND the current password, (3) confirm in the shared
// ConfirmDialog. The server re-checks the password itself. A "contact us"
// link stays as the fallback (e.g. a forgotten password).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "../AuthContext";
import { confirmWordMatches, deleteMyAccount } from "../lib/deleteAccount";
import { useT } from "../lib/i18n/LocaleProvider";
import { translateError } from "../lib/i18n/serverErrors";
import { supabase } from "../lib/supabaseClient";
import { toast } from "../lib/toastBus";
import { ConfirmDialog } from "./ConfirmDialog";

export function DeleteAccountSection() {
  const { t } = useT();
  const { signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const word = t("account.delete.confirmWord");
  const ready = confirmWordMatches(typed, word) && password.length > 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ready) setConfirming(true);
  }

  async function doDelete() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    try {
      await deleteMyAccount(supabase, password);
      setConfirming(false);
      toast({ key: "account.delete.done", kind: "success", duration: 9000 });
      // The auth user is gone server-side; clear the local session too.
      await signOut().catch(() => {});
      router.push("/");
    } catch (err) {
      setConfirming(false);
      setError(translateError(err instanceof Error ? err.message : "", t) || t("account.delete.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--faint)]">
        {t("account.delete.heading")}
      </h2>
      <p className="text-xs text-[var(--muted)]">{t("account.delete.description")}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-[var(--faint)]">
        <li>{t("account.delete.item.data")}</li>
        <li>{t("account.delete.item.games")}</li>
        <li>{t("account.delete.item.clubs")}</li>
        <li>{t("account.delete.item.irreversible")}</li>
      </ul>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="self-start rounded-lg border border-[var(--danger)]/50 px-4 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--panel-soft)]"
        >
          {t("account.delete.button")}
        </button>
      ) : (
        <form
          onSubmit={submit}
          className="flex flex-col gap-2 rounded-lg border border-[var(--danger)]/40 p-3"
        >
          <label className="flex flex-col gap-1 text-xs text-[var(--muted)]">
            {t("account.delete.typePrompt", { word })}
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
            />
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder={t("account.currentPasswordPlaceholder")}
            className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
          {error && (
            <p role="alert" className="text-xs text-[var(--danger)]">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
                setPassword("");
                setError(null);
              }}
              className="flex-1 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={!ready}
              className="flex-1 rounded-lg border border-[var(--danger)] px-4 py-2.5 text-sm font-semibold text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("account.delete.continue")}
            </button>
          </div>
        </form>
      )}

      <p className="text-xs text-[var(--faint)]">
        {t("account.delete.fallbackPrefix")}{" "}
        <Link href="/support?type=privacy" className="underline hover:text-[var(--heading)]">
          {t("account.delete.fallbackLink")}
        </Link>
        .
      </p>

      <ConfirmDialog
        open={confirming}
        danger
        busy={busy}
        title={t("account.delete.confirmTitle")}
        body={t("account.delete.confirmBody")}
        confirmLabel={t("account.delete.confirmButton")}
        onConfirm={doDelete}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
