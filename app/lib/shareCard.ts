/**
 * Renders the end-of-game standings as a PNG on a canvas — the thing people
 * actually post, versus a run-on line of text. Pulls its colours from the
 * live theme (getComputedStyle on <html>) so the image matches whatever
 * table the player is looking at. Returns null if canvas 2D isn't available
 * (very old browsers) so the caller can fall back to the text share.
 */

import type { AchievementCategory, AchievementTier } from "@/achievements";
import { findPremiumEmojiOption, LEVEL_MEDAL_COLOR } from "./avatarPresets";
import { findBannerOption } from "./bannerPresets";
import {
  ACHIEVEMENT_ICON_ELEMENTS,
  CREATOR_STAR_PATH,
  IconElement,
  MEDAL_DISC,
  MEDAL_RIBBON_ELEMENTS,
} from "./achievementIconPaths";

/** Always baked into the image itself, not just copied to the clipboard —
 * see renderProfileShareCard's own doc for why a picture-only share (the
 * one thing every share target reliably supports, see shareProfileCard's
 * comment in player/page.tsx) needs this to guarantee the link actually
 * reaches whoever receives it. */
const SITE_URL = "books-and-runs.vercel.app";

export interface ShareRow {
  rank: number;
  /** "Lv15" — the account level for you, the theoretical level for an AI. */
  level: string;
  /** The player's display name, avatar emoji included ("🦉 Hedda", "You"). */
  name: string;
  score: number;
  isWinner: boolean;
}

export interface ShareCardInput {
  headline: string;
  rows: ShareRow[];
}

function themeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export async function renderShareCard(input: ShareCardInput): Promise<Blob | null> {
  const scale = 2;
  const W = 540;
  const rowH = 52;
  const headerH = 188;
  const bottomPad = 22;
  const H = headerH + input.rows.length * rowH + bottomPad;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const bg = themeColor("--bg", "#0a2b20");
  const heading = themeColor("--heading", "#fef3c7");
  const text = themeColor("--text", "#f5f0e6");
  const faint = themeColor("--faint", "rgba(209,250,229,0.45)");
  const accent = themeColor("--accent", "#fbbf24");

  // felt + a soft top glow, same idea as globals.css's body background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, -40, 0, W / 2, -40, W * 0.9);
  glow.addColorStop(0, hexWithAlpha(accent, 0.14));
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const sans =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

  ctx.textBaseline = "middle";

  // header
  ctx.fillStyle = faint;
  ctx.font = `600 15px ${sans}`;
  ctx.textAlign = "left";
  ctx.fillText("🃏  BOOKS & RUNS", 34, 44);

  ctx.fillStyle = heading;
  ctx.font = `800 30px ${sans}`;
  wrapText(ctx, input.headline, 34, 92, W - 68, 36);

  ctx.strokeStyle = hexWithAlpha(text, 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(34, headerH - 20);
  ctx.lineTo(W - 34, headerH - 20);
  ctx.stroke();

  // rows
  input.rows.forEach((row, i) => {
    const y = headerH + i * rowH + rowH / 2;
    if (row.isWinner) {
      ctx.fillStyle = hexWithAlpha(accent, 0.12);
      roundRect(ctx, 24, y - rowH / 2 + 4, W - 48, rowH - 8, 10);
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = faint;
    ctx.font = `500 15px ${sans}`;
    ctx.fillText(`${row.rank}`, 40, y);

    ctx.fillStyle = row.isWinner ? accent : faint;
    ctx.font = `700 12px ${sans}`;
    ctx.fillText(row.level, 70, y);

    ctx.fillStyle = row.isWinner ? heading : text;
    ctx.font = `${row.isWinner ? 700 : 500} 17px ${sans}`;
    ctx.fillText(row.name, 118, y);

    ctx.textAlign = "right";
    ctx.fillStyle = heading;
    ctx.font = `700 18px ${sans}`;
    ctx.fillText(`${row.score}`, W - 40, y);
  });

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export interface ShareTrophy {
  category: AchievementCategory;
  tier: AchievementTier;
  familyTitle: string;
}

export interface ProfileShareCardInput {
  displayName: string;
  isCreator: boolean;
  titleLabel: string | null;
  level: number;
  avatarKind: "emoji" | "photo";
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarPhotoUrl: string | null;
  /** A solid ring color, or null for no frame — the "grandmaster" rotating
   * gradient frame (see AvatarFrame.tsx) isn't attempted here, a static
   * export has no motion to show off anyway; it just renders framed with
   * one of its own gradient stops instead of failing to render at all. */
  frameColor: string | null;
  /** An earned overlay emoji shown in the avatar's corner, separate from
   * the avatar itself — see migration 0031's `badge` column. Null for none. */
  badge: string | null;
  /** The raw `leaderboard_entries.banner` id (bannerPresets.ts) — resolved
   * here, not by the caller, since it needs the same lookup ProfileBanner
   * and player/page.tsx's onBanner text-color branch both use. */
  banner: string | null;
  stats: { label: string; value: string }[];
  /** Up to 6 pinned trophies, in Trophy Case order — same shape as the real
   * page's ShowcaseItem, just without the `key`/`familyId` this renderer
   * doesn't need. */
  trophies: ShareTrophy[];
}

const TIER_RING_COLOR: Record<AchievementTier, string> = {
  beginner: "#CD7F32",
  easy: "#B0B8C1",
  medium: "#F5C518",
  hard: "#4FD1C5",
  expert: "#38BDF8",
};

/** Replays achievementIconPaths.ts's element data as Path2D draws — canvas
 * has no SVG renderer, so this is the canvas-side twin of
 * AchievementIcons.tsx's JSX renderer. `size` is the on-canvas pixel size
 * for the icon's 24x24 viewBox. */
function drawIconElements(
  ctx: CanvasRenderingContext2D,
  elements: IconElement[],
  cx: number,
  cy: number,
  size: number,
  color: string
): void {
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const el of elements) {
    if (el.kind === "path") {
      ctx.stroke(new Path2D(el.d));
    } else if (el.kind === "circle") {
      ctx.beginPath();
      ctx.arc(el.cx, el.cy, el.r, 0, Math.PI * 2);
      if (el.filled) ctx.fill();
      else ctx.stroke();
    } else {
      ctx.stroke(roundedRectPath2D(el.x, el.y, el.w, el.h, el.rx));
    }
  }
  ctx.restore();
}

/** Same shape as drawIconElements, for the level-milestone medal (see
 * PremiumBadgeIcon.tsx's MedalIcon) — its disc is filled with the
 * milestone's own color rather than `currentColor`, the one visual
 * difference the ribbon icons don't have. */
function drawMedalIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  strokeColor: string,
  discColor: string
): void {
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const el of MEDAL_RIBBON_ELEMENTS) {
    if (el.kind === "path") ctx.stroke(new Path2D(el.d));
  }
  ctx.beginPath();
  ctx.arc(MEDAL_DISC.cx, MEDAL_DISC.cy, MEDAL_DISC.discR, 0, Math.PI * 2);
  ctx.fillStyle = discColor;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(MEDAL_DISC.cx, MEDAL_DISC.cy, MEDAL_DISC.ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function roundedRectPath2D(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}

/** Parses `linear-gradient(135deg, c1, c2)` (every non-grandmaster banner —
 * see bannerPresets.ts) into its two color stops. */
function parseLinearGradientStops(css: string): [string, string] | null {
  const m = css.match(/linear-gradient\([^,]+,\s*([^,]+),\s*([^)]+)\)/);
  return m ? [m[1].trim(), m[2].trim()] : null;
}

/** Parses `conic-gradient(from 0deg, c1, c2, ..., cN)` (grandmaster only)
 * into its ordered color stops. */
function parseConicGradientStops(css: string): string[] | null {
  const m = css.match(/conic-gradient\([^,]+,\s*(.+)\)/);
  return m ? m[1].split(",").map((s) => s.trim()) : null;
}

/** Fills [0,0,w,h] with the given banner preset's gradient, same visual
 * language as ProfileBanner.tsx (a 135° linear gradient approximated here
 * as corner-to-corner, close enough for a shared image) — or, for the one
 * conic-gradient preset (grandmaster), a real conic gradient where the
 * browser supports it, falling back to a diagonal approximation of the
 * same stops otherwise. */
function fillBannerGradient(ctx: CanvasRenderingContext2D, css: string, w: number, h: number): void {
  const conicStops = parseConicGradientStops(css);
  if (conicStops) {
    const grad =
      typeof ctx.createConicGradient === "function"
        ? ctx.createConicGradient(0, w / 2, h / 2)
        : ctx.createLinearGradient(0, 0, w, h);
    conicStops.forEach((c, i) => grad.addColorStop(i / (conicStops.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    return;
  }
  const stops = parseLinearGradientStops(css);
  const grad = ctx.createLinearGradient(0, 0, w, h);
  if (stops) {
    grad.addColorStop(0, stops[0]);
    grad.addColorStop(1, stops[1]);
  } else {
    grad.addColorStop(0, "#123c2c");
    grad.addColorStop(1, "#123c2c");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function loadImageForCanvas(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Renders a shareable "profile card" PNG — banner, avatar (+ frame +
 * badge), name (+ Creator pill), title, level, a few headline stats, and a
 * real Trophy Case (medal + icon + family name, not bare dots). Same
 * visual language and canvas approach as renderShareCard above (a second,
 * differently-shaped card rather than a generalized one: a game result is
 * a list of rows, a profile is a single subject with an avatar — trying to
 * force both through one shape would've made each harder to read, not
 * easier to maintain). The site URL is baked into the image itself (see
 * SITE_URL above) — sharing this picture is the one thing every share
 * target reliably supports (see shareProfileCard's own comment in
 * player/page.tsx for why the link isn't also passed to navigator.share),
 * so the link has to travel with the pixels to reliably reach whoever
 * receives it.
 */
export async function renderProfileShareCard(input: ProfileShareCardInput): Promise<Blob | null> {
  const scale = 2;
  const W = 540;
  const bannerOption = findBannerOption(input.banner);
  const onBanner = !!bannerOption;
  const hasStats = input.stats.length > 0;
  const hasTrophies = input.trophies.length > 0;
  const headerH = 216;
  const footerH = 30;
  const H = headerH + (hasStats ? 78 : 0) + (hasTrophies ? 118 : 0) + footerH;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const bg = themeColor("--bg", "#0a2b20");
  const panel = themeColor("--panel", "#123c2c");
  const heading = themeColor("--heading", "#fef3c7");
  const text = themeColor("--text", "#f5f0e6");
  const faint = themeColor("--faint", "rgba(209,250,229,0.45)");
  const accent = themeColor("--accent", "#fbbf24");

  // The whole card starts on the theme's own background (stats/trophies
  // below the header always sit on this, same as the real page — the
  // banner is scoped to the identity header only, see ProfileBanner.tsx).
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (bannerOption) {
    // Same 135°-gradient-plus-dark-scrim language as ProfileBanner.tsx —
    // the scrim guarantees the white header text stays legible regardless
    // of which preset's stops happen to land where.
    fillBannerGradient(ctx, bannerOption.css, W, headerH);
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(0, 0, W, headerH);
  } else {
    const glow = ctx.createRadialGradient(W / 2, -40, 0, W / 2, -40, W * 0.9);
    glow.addColorStop(0, hexWithAlpha(accent, 0.14));
    glow.addColorStop(1, "transparent");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, headerH);
  }

  const sans =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textBaseline = "middle";

  ctx.fillStyle = onBanner ? "rgba(255,255,255,0.85)" : faint;
  ctx.font = `600 14px ${sans}`;
  ctx.textAlign = "left";
  ctx.fillText("🃏  BOOKS & RUNS", 32, 34);

  const avatarSize = 84;
  const avatarX = 32;
  const avatarY = 56;
  const cx = avatarX + avatarSize / 2;
  const cy = avatarY + avatarSize / 2;

  if (input.frameColor) {
    ctx.beginPath();
    ctx.arc(cx, cy, avatarSize / 2 + 6, 0, Math.PI * 2);
    ctx.fillStyle = input.frameColor;
    ctx.fill();
  }

  let drewPhoto = false;
  if (input.avatarKind === "photo" && input.avatarPhotoUrl) {
    const img = await loadImageForCanvas(input.avatarPhotoUrl);
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
      ctx.restore();
      drewPhoto = true;
    }
  }
  if (!drewPhoto) {
    ctx.beginPath();
    ctx.arc(cx, cy, avatarSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = input.avatarColor ?? "#3B82F6";
    ctx.fill();
    if (input.avatarEmoji) {
      ctx.textAlign = "center";
      ctx.font = `${Math.round(avatarSize * 0.5)}px ${sans}`;
      ctx.fillText(input.avatarEmoji, cx, cy + 2);
    }
  }

  // The earned avatar-corner badge — same custom icon treatment as
  // EmojiOrBadge/PremiumBadgeIcon.tsx on the real page (a category-mastery
  // badge renders that category's own line-art icon; a level-milestone
  // badge renders the ribbon medal in its own color), not the raw emoji
  // character, which is what the previous version of this card drew.
  if (input.badge) {
    const badgeRadius = avatarSize * 0.18;
    const badgeCx = avatarX + avatarSize - badgeRadius * 0.6;
    const badgeCy = avatarY + avatarSize - badgeRadius * 0.6;
    // Ring matching the real chip's border-2 border-[var(--bg)], then a
    // bg-[var(--panel)] disc underneath the icon.
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(badgeCx, badgeCy, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = panel;
    ctx.fill();
    const premium = findPremiumEmojiOption(input.badge);
    const iconSize = badgeRadius * 1.3;
    if (premium?.unlock.kind === "categoryMastered") {
      drawIconElements(ctx, ACHIEVEMENT_ICON_ELEMENTS[premium.unlock.category], badgeCx, badgeCy, iconSize, heading);
    } else if (premium) {
      drawMedalIcon(ctx, badgeCx, badgeCy, iconSize, heading, LEVEL_MEDAL_COLOR[premium.emoji] ?? heading);
    } else {
      // Unrecognized value (shouldn't happen for a real account) — fall
      // back to the raw character rather than drawing nothing.
      ctx.textAlign = "center";
      ctx.fillStyle = heading;
      ctx.font = `${Math.round(badgeRadius * 1.3)}px ${sans}`;
      ctx.fillText(input.badge, badgeCx, badgeCy + 1);
    }
  }

  const textX = avatarX + avatarSize + 24;
  const maxTextW = W - textX - 24;
  ctx.textAlign = "left";
  ctx.fillStyle = onBanner ? "#ffffff" : heading;
  ctx.font = `800 26px ${sans}`;
  const nameW = Math.min(ctx.measureText(input.displayName).width, maxTextW);
  ctx.fillText(input.displayName, textX, avatarY + 20, maxTextW);

  if (input.isCreator) {
    // Same star-badge language as player/page.tsx's Creator pill.
    const pillX = textX + nameW + 10;
    const pillY = avatarY + 20;
    const pillW = 74;
    ctx.fillStyle = onBanner ? "rgba(255,255,255,0.2)" : hexWithAlpha(accent, 0.15);
    roundRect(ctx, pillX, pillY - 9, pillW, 18, 9);
    ctx.fill();
    ctx.save();
    ctx.translate(pillX + 12, pillY - 4.5);
    ctx.scale(0.42, 0.42);
    ctx.fillStyle = onBanner ? "#fef08a" : accent;
    ctx.fill(new Path2D(CREATOR_STAR_PATH));
    ctx.restore();
    ctx.fillStyle = onBanner ? "#fef08a" : accent;
    ctx.font = `700 10px ${sans}`;
    ctx.fillText("CREATOR", pillX + 20, pillY + 1);
  }

  if (input.titleLabel) {
    ctx.fillStyle = onBanner ? "#fde047" : accent;
    ctx.font = `600 14px ${sans}`;
    ctx.fillText(input.titleLabel, textX, avatarY + 46, maxTextW);
  }

  ctx.fillStyle = onBanner ? "rgba(255,255,255,0.85)" : faint;
  ctx.font = `600 13px ${sans}`;
  ctx.fillText(`Level ${input.level}`, textX, avatarY + (input.titleLabel ? 68 : 46));

  let y = headerH - 20;
  ctx.strokeStyle = hexWithAlpha(text, 0.14);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, y);
  ctx.lineTo(W - 32, y);
  ctx.stroke();
  y += 14;

  if (hasStats) {
    const colW = (W - 64) / input.stats.length;
    input.stats.forEach((s, i) => {
      const x = 32 + colW * i + colW / 2;
      ctx.textAlign = "center";
      ctx.fillStyle = heading;
      ctx.font = `800 22px ${sans}`;
      ctx.fillText(s.value, x, y + 24);
      ctx.fillStyle = faint;
      ctx.font = `600 11px ${sans}`;
      ctx.fillText(s.label.toUpperCase(), x, y + 48);
    });
    y += 78;
  }

  if (hasTrophies) {
    ctx.textAlign = "left";
    ctx.fillStyle = faint;
    ctx.font = `600 11px ${sans}`;
    ctx.fillText("TROPHY CASE", 32, y + 6);
    // Same medal shape as the real Trophy Case's TrophyBadge: a tier-
    // colored ring, a panel-colored disc, the category's own icon at half
    // size, and the family name underneath — not a bare color dot.
    const medalR = 22;
    const medalY = y + 24 + medalR;
    const colW = (W - 64) / input.trophies.length;
    input.trophies.forEach((trophy, i) => {
      const cx2 = 32 + colW * i + colW / 2;
      ctx.beginPath();
      ctx.arc(cx2, medalY, medalR, 0, Math.PI * 2);
      ctx.fillStyle = TIER_RING_COLOR[trophy.tier];
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx2, medalY, medalR - 3, 0, Math.PI * 2);
      ctx.fillStyle = panel;
      ctx.fill();
      drawIconElements(ctx, ACHIEVEMENT_ICON_ELEMENTS[trophy.category], cx2, medalY, medalR, heading);
      ctx.textAlign = "center";
      ctx.fillStyle = faint;
      ctx.font = `500 10px ${sans}`;
      const label =
        trophy.familyTitle.length > 12 ? `${trophy.familyTitle.slice(0, 11)}…` : trophy.familyTitle;
      ctx.fillText(label, cx2, medalY + medalR + 14, colW - 4);
    });
    y += 118;
  }

  // The link, baked into the image itself — see this function's own doc.
  ctx.textAlign = "center";
  ctx.fillStyle = faint;
  ctx.font = `500 11px ${sans}`;
  ctx.fillText(SITE_URL, W / 2, H - footerH / 2);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number
): void {
  const words = str.split(" ");
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, cy);
      line = w;
      cy += lineH;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cy);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Accepts #rgb / #rrggbb / rgb()/rgba() and returns an rgba() string at the
 * given alpha — the theme tokens are a mix of all of these. */
function hexWithAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}
