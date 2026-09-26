"use client";

// Bug/feature-request intake. Submits through the `contact` Edge Function
// (supabase/functions/contact), which emails the developer directly — the
// address itself never ships to the client, in either the page source or
// any network request this page makes (see the function for where it's
// actually read, from a Supabase secret). Works signed in or signed out;
// see the function's own doc for why an anonymous submission is fine here.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { BackLink } from "../components/BackLink";
import { useT } from "../lib/i18n/LocaleProvider";
import { loadSupabase } from "../lib/supabaseClient";

type ReportType = "bug" | "feature" | "privacy";

const MAX_SUBJECT = 150;
const MAX_DESCRIPTION = 5000;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENTS = 5;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"];

interface PickedFile {
  file: File;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result is "data:<mime>;base64,<data>" — Resend's attachments
      // API wants just the trailing base64, not the data: URL wrapper.
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SupportPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useT();
  const [type, setType] = useState<ReportType>("bug");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [replyTo, setReplyTo] = useState(user?.email ?? "");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Whether this visit came from ReviewPrompt.tsx (the only place that ever
  // links here with a ?type= param — see the effect below) — if so, "back"
  // should return to wherever that was (the game-over results, almost
  // always still one history entry behind this page since game-over is
  // client-side state on /game, not its own route) instead of unconditionally
  // going Home, which would otherwise strand the player away from a result
  // screen they were still looking at a moment ago.
  const [cameFromReviewPrompt, setCameFromReviewPrompt] = useState(false);

  // Pre-selects the type dropdown for a visitor arriving from a link that
  // already knows which kind of report this is (e.g. ReviewPrompt.tsx's
  // "not really enjoying it" / "yes!" branches) — read once on mount, not
  // watched live, since nothing else on this page ever changes the URL.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("type");
    if (requested === "bug" || requested === "feature") {
      setType(requested);
      setCameFromReviewPrompt(true);
    } else if (requested === "privacy") {
      // From Account → "Delete your account" fallback: no review-prompt back-nav.
      setType("privacy");
    }
  }, []);

  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);

  function handleFilesPicked(picked: FileList | null) {
    setFileError(null);
    if (!picked || picked.length === 0) return;
    const next = [...files];
    for (const file of Array.from(picked)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setFileError(t("support.maxAttachmentsReached", { max: MAX_ATTACHMENTS }));
        break;
      }
      if (ALLOWED_TYPES.length > 0 && !ALLOWED_TYPES.includes(file.type)) {
        setFileError(t("support.unsupportedFileType", { name: file.name }));
        continue;
      }
      const wouldBeTotal = next.reduce((sum, f) => sum + f.file.size, 0) + file.size;
      if (wouldBeTotal > MAX_ATTACHMENT_BYTES) {
        setFileError(t("support.attachmentsTooLarge", { max: formatBytes(MAX_ATTACHMENT_BYTES) }));
        continue;
      }
      next.push({ file });
    }
    setFiles(next);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();
    if (!trimmedSubject || !trimmedDescription) {
      setErrorMessage(t("support.subjectAndDescriptionRequired"));
      setStatus("error");
      return;
    }

    setStatus("sending");
    setErrorMessage(null);
    try {
      const supabase = await loadSupabase();
      if (!supabase) throw new Error("not configured");

      const attachments = await Promise.all(
        files.map(async ({ file }) => ({
          filename: file.name,
          contentType: file.type,
          base64: await fileToBase64(file),
        }))
      );

      const { data, error } = await supabase.functions.invoke("contact", {
        body: {
          type,
          subject: trimmedSubject,
          description: trimmedDescription,
          replyTo: replyTo.trim() || undefined,
          attachments,
        },
      });

      if (error || !data?.ok) {
        throw new Error((data as { error?: string } | null)?.error ?? error?.message ?? "send failed");
      }

      setStatus("sent");
      setSubject("");
      setDescription("");
      setFiles([]);
    } catch {
      setStatus("error");
      setErrorMessage(t("support.sendFailedGeneric"));
    }
  }

  if (status === "sent") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <p className="text-4xl" aria-hidden="true">
          ✅
        </p>
        <h1 className="text-xl font-bold text-[var(--heading)]">{t("support.thanksHeading")}</h1>
        <p className="text-sm text-[var(--muted)]">
          {replyTo.trim() ? t("support.replyIfProvided") : t("support.replyIfNotProvided")}
        </p>
        <div className="mt-2 flex gap-3">
          <button
            onClick={() => setStatus("idle")}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--muted)] hover:bg-[var(--panel-soft)]"
          >
            {t("support.sendAnother")}
          </button>
          {cameFromReviewPrompt ? (
            <button
              onClick={() => router.back()}
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]"
            >
              {t("howToPlay.backToGame")}
            </button>
          ) : (
            <Link
              href="/"
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--on-accent)]"
            >
              {t("common.home")}
            </Link>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-10">
      {cameFromReviewPrompt ? (
        <BackLink onClick={() => router.back()} label={t("howToPlay.backToGame")} />
      ) : (
        <BackLink href="/profile" smart />
      )}

      <div>
        <h1 className="text-2xl font-bold text-[var(--heading)]">{t("support.title")}</h1>
        <p className="mt-1 text-sm text-[var(--faint)]">{t("support.subheading")}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-type" className="text-sm font-medium text-[var(--heading)]">
            {t("support.whatIsThisAbout")}
          </label>
          <select
            id="report-type"
            value={type}
            onChange={(e) => setType(e.target.value as ReportType)}
            className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          >
            <option value="bug">{t("support.bug")}</option>
            <option value="feature">{t("support.featureRequest")}</option>
            <option value="privacy">{t("support.privacyRequest")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-subject" className="text-sm font-medium text-[var(--heading)]">
            {t("support.subject")}
          </label>
          <input
            id="report-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={
              type === "bug"
                ? t("support.subjectPlaceholderBug")
                : type === "privacy"
                  ? t("support.subjectPlaceholderPrivacy")
                  : t("support.subjectPlaceholderFeature")
            }
            maxLength={MAX_SUBJECT}
            required
            className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-description" className="text-sm font-medium text-[var(--heading)]">
            {t("support.description")}
          </label>
          <textarea
            id="report-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              type === "bug"
                ? t("support.descriptionPlaceholderBug")
                : type === "privacy"
                  ? t("support.descriptionPlaceholderPrivacy")
                  : t("support.descriptionPlaceholderFeature")
            }
            maxLength={MAX_DESCRIPTION}
            required
            rows={6}
            className="resize-none rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
          <span className="self-end text-xs text-[var(--faint)]">
            {description.length} / {MAX_DESCRIPTION}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-email" className="text-sm font-medium text-[var(--heading)]">
            {t("support.yourEmail")} <span className="font-normal text-[var(--faint)]">{t("support.emailOptionalNote")}</span>
          </label>
          <input
            id="report-email"
            type="email"
            value={replyTo}
            onChange={(e) => setReplyTo(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg bg-[var(--panel-soft)] px-4 py-3 text-sm text-[var(--heading)] outline-none ring-1 ring-[var(--border)] focus:ring-[var(--accent)]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="report-files" className="text-sm font-medium text-[var(--heading)]">
            {t("support.attachments")} <span className="font-normal text-[var(--faint)]">{t("support.attachmentsOptionalNote")}</span>
          </label>
          <input
            id="report-files"
            type="file"
            multiple
            accept={ALLOWED_TYPES.join(",")}
            onChange={(e) => {
              handleFilesPicked(e.target.files);
              e.target.value = "";
            }}
            className="text-sm text-[var(--muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--panel)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--heading)] hover:file:bg-[var(--panel-soft)]"
          />
          {files.length > 0 && (
            <ul className="flex flex-col gap-1">
              {files.map((f, i) => (
                <li
                  key={`${f.file.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded-md bg-[var(--panel)] px-3 py-1.5 text-xs text-[var(--muted)]"
                >
                  <span className="truncate">
                    {f.file.name} · {formatBytes(f.file.size)}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    aria-label={t("support.removeFile", { name: f.file.name })}
                    className="shrink-0 text-[var(--faint)] hover:text-[var(--danger)]"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && (
            <span className="text-xs text-[var(--faint)]">
              {formatBytes(totalBytes)} / {formatBytes(MAX_ATTACHMENT_BYTES)}
            </span>
          )}
          {fileError && <p className="text-xs text-[var(--danger)]">{fileError}</p>}
        </div>

        {status === "error" && errorMessage && <p className="text-sm text-[var(--danger)]">{errorMessage}</p>}

        <button
          type="submit"
          disabled={status === "sending"}
          className="mt-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {status === "sending" ? t("support.sending") : t("support.send")}
        </button>
      </form>
    </main>
  );
}
