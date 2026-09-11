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
