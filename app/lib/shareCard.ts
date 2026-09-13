/**
 * Renders the end-of-game standings as a PNG on a canvas — the thing people
 * actually post, versus a run-on line of text. Pulls its colours from the
 * live theme (getComputedStyle on <html>) so the image matches whatever
 * table the player is looking at. Returns null if canvas 2D isn't available
 * (very old browsers) so the caller can fall back to the text share.
 */

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

export interface ProfileShareCardInput {
  displayName: string;
  titleLabel: string | null;
  level: number;
  rankLabel: string | null;
  avatarKind: "emoji" | "photo";
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarPhotoUrl: string | null;
  /** A solid ring color, or null for no frame — the "grandmaster" rotating
   * gradient frame (see AvatarFrame.tsx) isn't attempted here, a static
   * export has no motion to show off anyway; it just renders framed with
   * one of its own gradient stops instead of failing to render at all. */
  frameColor: string | null;
  stats: { label: string; value: string }[];
  /** Tier ring colors for up to 6 pinned trophies, in Trophy Case order. */
  trophyColors: string[];
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
 * Renders a shareable "profile card" PNG — avatar (+ frame), name, title,
 * level/rank, a few headline stats, and Trophy Case dots. Same visual
 * language and canvas approach as renderShareCard above (a second,
 * differently-shaped card rather than a generalized one: a game result is
 * a list of rows, a profile is a single subject with an avatar — trying to
 * force both through one shape would've made each harder to read, not
 * easier to maintain).
 */
export async function renderProfileShareCard(input: ProfileShareCardInput): Promise<Blob | null> {
  const scale = 2;
  const W = 540;
  const hasStats = input.stats.length > 0;
  const hasTrophies = input.trophyColors.length > 0;
  const H = 216 + (hasStats ? 78 : 0) + (hasTrophies ? 54 : 0);

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

  ctx.fillStyle = faint;
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

  const textX = avatarX + avatarSize + 24;
  ctx.textAlign = "left";
  ctx.fillStyle = heading;
  ctx.font = `800 26px ${sans}`;
  ctx.fillText(input.displayName, textX, avatarY + 20);

  if (input.titleLabel) {
    ctx.fillStyle = accent;
    ctx.font = `600 14px ${sans}`;
    ctx.fillText(input.titleLabel, textX, avatarY + 46);
  }

  ctx.fillStyle = faint;
  ctx.font = `600 13px ${sans}`;
  const levelLine = input.rankLabel ? `Level ${input.level}  ·  ${input.rankLabel}` : `Level ${input.level}`;
  ctx.fillText(levelLine, textX, avatarY + (input.titleLabel ? 68 : 46));

  let y = avatarY + avatarSize + 26;
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
    const dotY = y + 28;
    input.trophyColors.forEach((color, i) => {
      const x = 32 + i * 34 + 12;
      ctx.beginPath();
      ctx.arc(x, dotY, 12, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export interface ProfileAvatarCardInput {
  avatarKind: "emoji" | "photo";
  avatarEmoji: string | null;
  avatarColor: string | null;
  avatarPhotoUrl: string | null;
  /** A solid ring color, or null for no frame — same simplification as
   * renderProfileShareCard's own frameColor (see its doc). */
  frameColor: string | null;
  /** A banner preset's raw CSS `background` value (bannerPresets.ts), or
   * null for none — approximated on canvas by bannerCanvasFill below,
   * since canvas can't consume a CSS gradient string directly. */
  bannerCss: string | null;
}

/**
 * Renders just the avatar — picture, frame ring, and banner backdrop, no
 * name/stats/trophy text — for sharing as a picture-plus-link instead of a
 * standalone infographic: the profile's own URL (see player/page.tsx's
 * shareProfileCard) carries the name/stats/trophies instead, and stays
 * current after the picture's been shared, unlike text baked into a PNG.
 */
export async function renderProfileAvatarCard(input: ProfileAvatarCardInput): Promise<Blob | null> {
  const scale = 2;
  const W = 480;
  const H = 480;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);

  const bg = themeColor("--bg", "#0a2b20");
  const cx = W / 2;
  const cy = H / 2;

  ctx.fillStyle = (input.bannerCss && bannerCanvasFill(ctx, input.bannerCss, W, H, cx, cy)) || bg;
  ctx.fillRect(0, 0, W, H);

  const avatarSize = 220;
  if (input.frameColor) {
    ctx.beginPath();
    ctx.arc(cx, cy, avatarSize / 2 + 10, 0, Math.PI * 2);
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
      ctx.drawImage(img, cx - avatarSize / 2, cy - avatarSize / 2, avatarSize, avatarSize);
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
      const sans =
        '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${Math.round(avatarSize * 0.5)}px ${sans}`;
      ctx.fillText(input.avatarEmoji, cx, cy + 2);
    }
  }

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

/** Approximates a bannerPresets.ts CSS `background` gradient string as a
 * canvas gradient — canvas has no way to consume a raw CSS background
 * value, so this pulls out the hex stops instead: a linear-gradient(135deg,
 * ...) becomes a top-left-to-bottom-right CanvasGradient with the same
 * first/last colors, and the one conic-gradient (Grandmaster) becomes a
 * real CanvasGradient conic sweep through every stop, when the browser
 * supports createConicGradient — falling back to the same linear treatment
 * otherwise. Returns null (caller falls back to a flat color) if the CSS
 * doesn't contain at least two hex colors to work with. */
function bannerCanvasFill(
  ctx: CanvasRenderingContext2D,
  css: string,
  w: number,
  h: number,
  cx: number,
  cy: number
): CanvasGradient | null {
  const colors = css.match(/#[0-9a-fA-F]{6}/g);
  if (!colors || colors.length < 2) return null;
  if (css.startsWith("conic-gradient") && typeof ctx.createConicGradient === "function") {
    const gradient = ctx.createConicGradient(0, cx, cy);
    colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
    return gradient;
  }
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[colors.length - 1]);
  return gradient;
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
