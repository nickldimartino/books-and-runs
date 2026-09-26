// Legitimate non-translated text found by hardcodedText.test.tsx. Every entry
// needs a reason. Paths are relative to app/.
export interface AllowedText {
  file: string;
  /** Exact normalized (whitespace-collapsed) text; a trailing "*" matches a prefix. */
  text: string;
  reason: string;
}

/** Whole files exempt from the scan. */
export const ALLOWLIST_FILES: Record<string, string> = {};

export const HARDCODED_ALLOWLIST: AllowedText[] = [
  { file: "components/IntroSplash.tsx", text: "Books & Runs", reason: "Product name (proper noun)" },
  { file: "page.tsx", text: "Books & Runs", reason: "Product name (proper noun)" },
  { file: "opengraph-image.tsx", text: "Books & Runs", reason: "Product name; static social-share image rendered at build time" },
  { file: "opengraph-image.tsx", text: "A free Contract Rummy card game", reason: "Static-export social image is English at build time (documented limitation)" },
  { file: "components/KeyboardHelp.tsx", text: "Enter", reason: "Physical keycap legend" },
  { file: "components/KeyboardHelp.tsx", text: "Space", reason: "Physical keycap legend" },
  { file: "settings/CardFacePicker.tsx", text: "Classic", reason: "Cosmetic card-face name (proper noun by convention)" },
  { file: "friends/page.tsx", text: "BR-XXXXX", reason: "Friend-code format example, not prose" },
  { file: "support/page.tsx", text: "you@example.com", reason: "Email placeholder convention" },
  { file: "history/HistoryContent.tsx", text: "Zioncheck", reason: "Proper noun (historical game name)" },
  { file: "history/HistoryContent.tsx", text: "Nick DiMartino", reason: "Author name" },
  { file: "privacy/PrivacyContent.tsx", text: "nick.l.dimartino@icloud.com", reason: "Contact email address" },
  { file: "terms/TermsContent.tsx", text: "nick.l.dimartino@icloud.com", reason: "Contact email address" },
];
