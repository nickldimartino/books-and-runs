import { Card } from "@/types";
import { CardFaceId, useCardFace } from "../lib/cardFaceStore";

/**
 * The printed face of a playing card, drawn as one SVG (viewBox
 * 0 0 100 140, the ~5:7 of a real card, plus a small transparent margin —
 * see below) so it scales cleanly from the 34px mini in the collapsed
 * drawer up to the full hand card. Everything paints with
 * `fill="currentColor"`, so the suit colour comes straight from
 * `.card-face`'s own themed `color` (--card-text / --card-red /
 * --card-wild-text — see globals.css and PlayingCard.tsx's colorClass).
 *
 * Which of the six styles below actually renders is read from
 * useCardFace() (see cardFaceStore.ts) unless a caller passes `style`
 * explicitly — the Settings picker does that, to preview every option at
 * once regardless of which one is currently active.
 */

type Tone = "black" | "red" | "wild";

// Suit silhouettes in their own 0–100 box, placed by <use>-style transform.
const SUIT_PATHS: Record<string, string> = {
  spades:
    "M50 6 C50 24 18 40 18 62 C18 78 34 84 45 74 C42 86 37 92 28 98 L72 98 C63 92 58 86 55 74 C66 84 82 78 82 62 C82 40 50 24 50 6 Z",
  hearts:
    "M50 96 C50 96 10 66 10 38 C10 22 23 12 36 12 C44 12 49 18 50 27 C51 18 56 12 64 12 C77 12 90 22 90 38 C90 66 50 96 50 96 Z",
  diamonds: "M50 4 L88 50 L50 96 L12 50 Z",
  clubs:
    "M50 10 C60 10 68 18 68 28 C68 32 67 36 64 39 C71 35 81 37 86 44 C91 52 89 63 81 68 C74 72 64 69 59 62 C60 70 64 82 72 92 L28 92 C36 82 40 70 41 62 C36 69 26 72 19 68 C11 63 9 52 14 44 C19 37 29 35 36 39 C33 36 32 32 32 28 C32 18 40 10 50 10 Z",
};

// Corner star / centre star for the joker — a plain 5-point star.
const STAR_PATH =
  "M50 6 L61 38 L95 38 L67 58 L78 92 L50 72 L22 92 L33 58 L5 38 L39 38 Z";

// K / Q crown — five merlons on a band, sized to sit just above the letter.
const CROWN_PATH = "M14 22 L14 8 L24 16 L34 4 L44 16 L54 8 L54 22 Z";

const X_L = 30;
const X_C = 50;
const X_R = 70;
const Y_T = 30;
const Y_B = 110; // mirror of Y_T about the 70 centre-line

// Pip centres per rank, for the `realistic` style only. y > 70 is the lower
// half → that pip renders rotated 180°.
const PIP_LAYOUT: Record<string, [number, number][]> = {
  A: [[X_C, 70]],
  "2": [[X_C, Y_T], [X_C, Y_B]],
  "3": [[X_C, Y_T], [X_C, 70], [X_C, Y_B]],
  "4": [[X_L, Y_T], [X_R, Y_T], [X_L, Y_B], [X_R, Y_B]],
  "5": [[X_L, Y_T], [X_R, Y_T], [X_C, 70], [X_L, Y_B], [X_R, Y_B]],
  "6": [[X_L, Y_T], [X_R, Y_T], [X_L, 70], [X_R, 70], [X_L, Y_B], [X_R, Y_B]],
  "7": [[X_L, Y_T], [X_R, Y_T], [X_C, 45], [X_L, 70], [X_R, 70], [X_L, Y_B], [X_R, Y_B]],
  "8": [
    [X_L, Y_T], [X_R, Y_T], [X_C, 45], [X_L, 70], [X_R, 70], [X_C, 95], [X_L, Y_B], [X_R, Y_B],
  ],
  "9": [
    [X_L, Y_T], [X_R, Y_T], [X_L, 53], [X_R, 53], [X_C, 70], [X_L, 87], [X_R, 87], [X_L, Y_B], [X_R, Y_B],
  ],
  "10": [
    [X_L, Y_T], [X_R, Y_T], [X_C, 41], [X_L, 53], [X_R, 53], [X_L, 87], [X_R, 87], [X_C, 99], [X_L, Y_B], [X_R, Y_B],
  ],
};

// 7×7 bitmaps for the `pixel` style's suit icons — chunky and deliberately
// low-res, the way a suit reads on an 8-bit sprite sheet, rather than the
// smooth vector silhouette every other style shares.
const PIXEL_SUITS: Record<string, string[]> = {
  hearts: ["0110110", "1111111", "1111111", "0111110", "0011100", "0001000", "0000000"],
  spades: ["0001000", "0011100", "0111110", "1111111", "0011100", "0111110", "0011100"],
  diamonds: ["0001000", "0011100", "0111110", "1111111", "0111110", "0011100", "0001000"],
  clubs: ["0011100", "0111110", "0011100", "1111111", "0011100", "0001000", "0011100"],
  joker: ["0001000", "0011100", "0101010", "1111111", "0101010", "0011100", "0001000"],
};

/** Draws one suit shape centred at (cx, cy), scaled to `size` units wide,
 * optionally flipped for a lower-half pip, filled or stroke-only. */
function Pip({
  suit,
  cx,
  cy,
  size,
  flip,
  outline,
}: {
  suit: string;
  cx: number;
  cy: number;
  size: number;
  flip?: boolean;
  outline?: boolean;
}) {
  const s = size / 100;
  const rot = flip ? 180 : 0;
  return (
    <path
      d={SUIT_PATHS[suit]}
      transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s}) translate(-50 -50)`}
      fill={outline ? "none" : "currentColor"}
      stroke={outline ? "currentColor" : undefined}
      strokeWidth={outline ? 4 : undefined}
    />
  );
}

/** A chunky pixel-art suit icon, centred at (cx, cy), `size` units square. */
function PixelSuit({ suit, cx, cy, size }: { suit: string; cx: number; cy: number; size: number }) {
  const grid = PIXEL_SUITS[suit] ?? PIXEL_SUITS.joker;
  const cell = size / 7;
  const origin = size / 2;
  return (
    <g transform={`translate(${cx - origin} ${cy - origin})`}>
      {grid.map((row, y) =>
        row.split("").map((bit, x) =>
          bit === "1" ? (
            <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="currentColor" />
          ) : null
        )
      )}
    </g>
  );
}

function CornerIndex({ label, suit }: { label: string; suit: string }) {
  return (
    <g>
      <text
        x="0"
        y="0"
        textAnchor="middle"
        // "JKR" (3 chars) needs to be smaller than "10" or its outer letter
        // rides into .card-face's rounded corner and gets clipped.
        fontSize={label.length > 2 ? 16 : label.length > 1 ? 20 : 24}
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
      >
        {label}
      </text>
      {suit !== "joker" && <Pip suit={suit} cx={0} cy={18} size={16} />}
    </g>
  );
}

interface StyleProps {
  card: Card;
  label: string;
  isCourt: boolean;
  isJoker: boolean;
}

// `classic` — the new default: one big rank and one big suit icon, centered,
// nothing else competing for attention. This is the same layout
// HandPreviewBar's collapsed-drawer mini cards have always used, just drawn
// in the same vector style as every other card instead of plain text.
function ClassicFace({ card, label, isCourt, isJoker }: StyleProps) {
  if (isJoker) {
    return (
      <g>
        <path d={STAR_PATH} transform="translate(50 58) scale(0.58) translate(-50 -50)" />
        <text
          x="50"
          y="108"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          letterSpacing="2"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill="currentColor"
        >
          JOKER
        </text>
      </g>
    );
  }
  return (
    <g>
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontSize={isCourt ? "44" : label === "10" ? "40" : "48"}
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
      >
        {label}
      </text>
      {isCourt && (card.rank === "K" || card.rank === "Q") && (
        <path d={CROWN_PATH} transform="translate(16 6)" />
      )}
      <Pip suit={card.suit} cx={50} cy={96} size={44} />
    </g>
  );
}

// `outline` (Boutique) — the exact Classic layout, but every fill becomes a
// stroke: reuses Pip's own existing `outline` prop (already built for
// Minimal's "thin outlined suit") rather than a new drawing.
function OutlineFace({ card, label, isCourt, isJoker }: StyleProps) {
  if (isJoker) {
    return (
      <g fill="none" stroke="currentColor" strokeWidth="2">
        <path d={STAR_PATH} transform="translate(50 58) scale(0.58) translate(-50 -50)" />
        <text
          x="50"
          y="108"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          letterSpacing="2"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          JOKER
        </text>
      </g>
    );
  }
  return (
    <g fill="none" stroke="currentColor" strokeWidth="2">
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontSize={isCourt ? "44" : label === "10" ? "40" : "48"}
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        {label}
      </text>
      {isCourt && (card.rank === "K" || card.rank === "Q") && (
        <path d={CROWN_PATH} transform="translate(16 6)" />
      )}
      <Pip suit={card.suit} cx={50} cy={96} size={44} outline />
    </g>
  );
}

// `realistic` — the original full treatment: corner indices, a real pip
// layout for number cards, a crowned monogram for courts.
function RealisticFace({ card, label, isCourt, isJoker }: StyleProps) {
  const tone: Tone = card.isWild ? "wild" : card.suit === "hearts" || card.suit === "diamonds" ? "red" : "black";
  return (
    <g fill="currentColor" data-tone={tone}>
      <g transform="translate(13 21)">
        <CornerIndex label={label} suit={card.suit} />
      </g>
      <g transform="translate(87 119) rotate(180)">
        <CornerIndex label={label} suit={card.suit} />
      </g>

      {isJoker ? (
        <g>
          <path d={STAR_PATH} transform="translate(50 66) scale(0.62) translate(-50 -50)" />
          <text
            x="50"
            y="104"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            letterSpacing="2"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="currentColor"
          >
            JOKER
          </text>
        </g>
      ) : isCourt ? (
        <g>
          <g opacity="0.14">
            <Pip suit={card.suit} cx={50} cy={74} size={62} />
          </g>
          {(card.rank === "K" || card.rank === "Q") && (
            <path d={CROWN_PATH} transform="translate(16 40)" />
          )}
          <text
            x="50"
            y="88"
            textAnchor="middle"
            fontSize="52"
            fontWeight="800"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="currentColor"
          >
            {card.rank}
          </text>
        </g>
      ) : (
        <g>
          {(PIP_LAYOUT[card.rank] ?? []).map(([cx, cy], i) => (
            <Pip key={i} suit={card.suit} cx={cx} cy={cy} size={card.rank === "A" ? 34 : 20} flip={cy > 70} />
          ))}
        </g>
      )}
    </g>
  );
}

// `bold` — the single largest rank of any style, with the suit shrunk to a
// small badge instead of competing for space. Built specifically for the
// "I can't see the numbers" case: there is nothing bigger on offer.
function BoldFace({ card, label, isJoker }: StyleProps) {
  if (isJoker) {
    return (
      <g>
        <path d={STAR_PATH} transform="translate(50 62) scale(0.9) translate(-50 -50)" />
      </g>
    );
  }
  return (
    <g>
      <text
        x="50"
        y={label.length > 1 ? "80" : "88"}
        textAnchor="middle"
        fontSize={label.length > 1 ? "56" : "92"}
        fontWeight="900"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
      >
        {label}
      </text>
      <Pip suit={card.suit} cx={78} cy={22} size={26} />
    </g>
  );
}

// `minimal` — a quiet, understated face: a thin-weight rank and an
// outline-only suit, deliberately not trying to fill the card.
function MinimalFace({ card, label, isJoker }: StyleProps) {
  if (isJoker) {
    return (
      <g>
        <path
          d={STAR_PATH}
          transform="translate(50 58) scale(0.5) translate(-50 -50)"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
        />
        <text
          x="50"
          y="104"
          textAnchor="middle"
          fontSize="12"
          fontWeight="400"
          letterSpacing="3"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          fill="currentColor"
        >
          JOKER
        </text>
      </g>
    );
  }
  return (
    <g>
      <text
        x="50"
        y="56"
        textAnchor="middle"
        fontSize="34"
        fontWeight="300"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
      >
        {label}
      </text>
      <Pip suit={card.suit} cx={50} cy={92} size={30} outline />
    </g>
  );
}

// `retro` — a vintage card-table look: a serif rank inside a thin framed
// border, in place of the sans-serif everything else on the page uses.
function RetroFace({ card, label, isCourt, isJoker }: StyleProps) {
  return (
    <g>
      <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke="currentColor" strokeWidth="0.75" opacity="0.35" />
      {isJoker ? (
        <g>
          <path d={STAR_PATH} transform="translate(50 58) scale(0.55) translate(-50 -50)" />
          <text
            x="50"
            y="106"
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            letterSpacing="2"
            fontFamily="Georgia, 'Times New Roman', serif"
            fill="currentColor"
          >
            JOKER
          </text>
        </g>
      ) : (
        <g>
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fontSize={label.length > 1 ? "36" : "42"}
            fontWeight="700"
            fontFamily="Georgia, 'Times New Roman', serif"
            fill="currentColor"
          >
            {label}
          </text>
          {isCourt && (card.rank === "K" || card.rank === "Q") && (
            <path d={CROWN_PATH} transform="translate(16 8)" />
          )}
          <Pip suit={card.suit} cx={50} cy={96} size={34} />
        </g>
      )}
    </g>
  );
}

// `pixel` — a chunky, low-res, retro-game treatment: a blocky monospace
// rank and a hand-bitmapped suit icon instead of the smooth vector shape
// every other style shares.
function PixelFace({ card, label, isJoker }: StyleProps) {
  return (
    <g>
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontSize={label.length > 1 ? "32" : "40"}
        fontWeight="700"
        letterSpacing="1"
        fontFamily="ui-monospace, 'Courier New', monospace"
        fill="currentColor"
      >
        {label}
      </text>
      <PixelSuit suit={isJoker ? "joker" : card.suit} cx={50} cy={96} size={40} />
    </g>
  );
}

// `shadow` (Boutique) — Bold's huge rank, redrawn with a duplicate offset
// copy behind it at low opacity for a pressed/embossed look, rather than
// Bold's own flat single pass.
function ShadowFace({ card, label, isJoker }: StyleProps) {
  if (isJoker) {
    return (
      <g>
        <path d={STAR_PATH} transform="translate(53 65) scale(0.9) translate(-50 -50)" opacity="0.3" />
        <path d={STAR_PATH} transform="translate(50 62) scale(0.9) translate(-50 -50)" />
      </g>
    );
  }
  return (
    <g>
      <text
        x="53"
        y={label.length > 1 ? "83" : "91"}
        textAnchor="middle"
        fontSize={label.length > 1 ? "56" : "92"}
        fontWeight="900"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
        opacity="0.3"
      >
        {label}
      </text>
      <text
        x="50"
        y={label.length > 1 ? "80" : "88"}
        textAnchor="middle"
        fontSize={label.length > 1 ? "56" : "92"}
        fontWeight="900"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
      >
        {label}
      </text>
      <Pip suit={card.suit} cx={78} cy={22} size={26} />
    </g>
  );
}

// `neon` (Boutique) — Outline's stroke-only layout, redrawn with a second,
// wider, low-opacity pass behind the crisp one for a glow/sign-tube look.
function NeonFace({ card, label, isCourt, isJoker }: StyleProps) {
  if (isJoker) {
    return (
      <g fill="none" stroke="currentColor">
        <path d={STAR_PATH} transform="translate(50 58) scale(0.58) translate(-50 -50)" strokeWidth="8" opacity="0.35" />
        <path d={STAR_PATH} transform="translate(50 58) scale(0.58) translate(-50 -50)" strokeWidth="2" />
        <text x="50" y="108" textAnchor="middle" fontSize="14" fontWeight="700" letterSpacing="2" strokeWidth="1.5">
          JOKER
        </text>
      </g>
    );
  }
  return (
    <g fill="none" stroke="currentColor">
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontSize={isCourt ? "44" : label === "10" ? "40" : "48"}
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        strokeWidth="6"
        opacity="0.35"
      >
        {label}
      </text>
      <text
        x="50"
        y="58"
        textAnchor="middle"
        fontSize={isCourt ? "44" : label === "10" ? "40" : "48"}
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        strokeWidth="1.5"
      >
        {label}
      </text>
      {isCourt && (card.rank === "K" || card.rank === "Q") && (
        <path d={CROWN_PATH} transform="translate(16 6)" strokeWidth="1.5" />
      )}
      <Pip suit={card.suit} cx={50} cy={96} size={44} outline />
    </g>
  );
}

// `deco` (Boutique) — an Art Deco frame: a stepped double border with
// corner ticks, plus a slim geometric rank — the border is the whole point
// here, unlike Retro's plain rounded rect.
function DecoFace({ card, label, isCourt, isJoker }: StyleProps) {
  return (
    <g>
      <rect x="8" y="8" width="84" height="124" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="14" y="14" width="72" height="112" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6" />
      {[
        [8, 8, 18, 8], [8, 8, 8, 18], [92, 8, 82, 8], [92, 8, 92, 18],
        [8, 132, 18, 132], [8, 132, 8, 122], [92, 132, 82, 132], [92, 132, 92, 122],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="3" />
      ))}
      {isJoker ? (
        <g>
          <path d={STAR_PATH} transform="translate(50 58) scale(0.5) translate(-50 -50)" />
          <text x="50" y="104" textAnchor="middle" fontSize="12" fontWeight="700" letterSpacing="3" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor">
            JOKER
          </text>
        </g>
      ) : (
        <g>
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fontSize={label.length > 1 ? "34" : "40"}
            fontWeight="600"
            letterSpacing="1"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="currentColor"
          >
            {label}
          </text>
          {isCourt && (card.rank === "K" || card.rank === "Q") && (
            <path d={CROWN_PATH} transform="translate(16 10)" />
          )}
          <Pip suit={card.suit} cx={50} cy={96} size={30} />
        </g>
      )}
    </g>
  );
}

// `sketch` (Boutique) — a loose hand-drawn feel: a dashed border, a
// slightly skewed rank, and a dashed-stroke pip — the one style that
// deliberately looks a little imperfect rather than clean vector art.
function SketchFace({ card, label, isCourt, isJoker }: StyleProps) {
  return (
    <g>
      <rect x="6" y="6" width="88" height="128" rx="8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.6" />
      {isJoker ? (
        <g transform="skewX(-4)">
          <path d={STAR_PATH} transform="translate(50 58) scale(0.55) translate(-50 -50)" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="3 2" />
          <text x="50" y="106" textAnchor="middle" fontSize="13" fontWeight="700" letterSpacing="2" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor">
            JOKER
          </text>
        </g>
      ) : (
        <g transform="skewX(-4)">
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fontSize={isCourt ? "42" : label === "10" ? "38" : "46"}
            fontWeight="700"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="currentColor"
          >
            {label}
          </text>
          {isCourt && (card.rank === "K" || card.rank === "Q") && (
            <path d={CROWN_PATH} transform="translate(16 6)" />
          )}
          <path
            d={SUIT_PATHS[card.suit]}
            transform="translate(50 96) scale(0.42) translate(-50 -50)"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeDasharray="4 3"
          />
        </g>
      )}
    </g>
  );
}

// `mono` (Boutique) — a quiet monospace rank over a faint baseline grid,
// distinct from Pixel's chunky bitmap suit — this one keeps the smooth
// vector pip, just the typography and a grid accent change.
function MonoFace({ card, label, isJoker }: StyleProps) {
  return (
    <g>
      <g opacity="0.12" stroke="currentColor" strokeWidth="0.5">
        <line x1="10" y1="46.6" x2="90" y2="46.6" />
        <line x1="10" y1="93.3" x2="90" y2="93.3" />
      </g>
      {isJoker ? (
        <g>
          <path d={STAR_PATH} transform="translate(50 58) scale(0.55) translate(-50 -50)" />
          <text x="50" y="104" textAnchor="middle" fontSize="12" fontWeight="700" letterSpacing="2" fontFamily="ui-monospace, 'Courier New', monospace" fill="currentColor">
            JKR
          </text>
        </g>
      ) : (
        <g>
          <text
            x="50"
            y="58"
            textAnchor="middle"
            fontSize={label.length > 1 ? "38" : "46"}
            fontWeight="700"
            fontFamily="ui-monospace, 'Courier New', monospace"
            fill="currentColor"
          >
            {label}
          </text>
          <Pip suit={card.suit} cx={50} cy={96} size={38} />
        </g>
      )}
    </g>
  );
}

// `ribbon` (Boutique) — a diagonal ribbon band across the card, with the
// rank set into it at the same angle — the one style whose rank isn't
// upright.
function RibbonFace({ card, label, isJoker }: StyleProps) {
  return (
    <g>
      <g transform="rotate(-16 50 70)">
        <rect x="-10" y="58" width="120" height="24" fill="currentColor" opacity="0.16" />
        {isJoker ? (
          <text x="50" y="75" textAnchor="middle" fontSize="14" fontWeight="700" letterSpacing="2" fontFamily="ui-sans-serif, system-ui, sans-serif" fill="currentColor">
            JOKER
          </text>
        ) : (
          <text
            x="50"
            y="76"
            textAnchor="middle"
            fontSize={label.length > 1 ? "24" : "28"}
            fontWeight="800"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
            fill="currentColor"
          >
            {label}
          </text>
        )}
      </g>
      {isJoker ? (
        <path d={STAR_PATH} transform="translate(50 100) scale(0.4) translate(-50 -50)" />
      ) : (
        <Pip suit={card.suit} cx={50} cy={112} size={30} />
      )}
    </g>
  );
}

// `halo` (Boutique) — the suit pip ringed by two concentric circles, like a
// faint halo/target, with a smaller centered rank than any other style.
function HaloFace({ card, label, isJoker }: StyleProps) {
  return (
    <g>
      <circle cx="50" cy="86" r="34" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.25" />
      <circle cx="50" cy="86" r="24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <text
        x="50"
        y="46"
        textAnchor="middle"
        fontSize={label.length > 1 ? "26" : "30"}
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="currentColor"
      >
        {isJoker ? "JKR" : label}
      </text>
      {isJoker ? (
        <path d={STAR_PATH} transform="translate(50 86) scale(0.36) translate(-50 -50)" />
      ) : (
        <Pip suit={card.suit} cx={50} cy={86} size={34} />
      )}
    </g>
  );
}

// `ledger` (Boutique) — an accounting-ledger look: horizontal rule lines
// across the whole card and a right-aligned rank, like a number in a
// column, with just a small suit mark in the corner.
function LedgerFace({ card, label, isJoker }: StyleProps) {
  return (
    <g>
      {[38, 58, 78, 98].map((y) => (
        <line key={y} x1="8" y1={y} x2="92" y2={y} stroke="currentColor" strokeWidth="0.75" opacity="0.2" />
      ))}
      <text
        x="86"
        y="66"
        textAnchor="end"
        fontSize={label.length > 1 ? "28" : "32"}
        fontWeight="700"
        fontFamily="ui-monospace, 'Courier New', monospace"
        fill="currentColor"
      >
        {isJoker ? "JKR" : label}
      </text>
      {isJoker ? (
        <path d={STAR_PATH} transform="translate(20 30) scale(0.22) translate(-50 -50)" />
      ) : (
        <Pip suit={card.suit} cx={20} cy={30} size={18} />
      )}
    </g>
  );
}

export function CardFace({ card, style }: { card: Card; style?: CardFaceId }) {
  const liveStyle = useCardFace();
  const resolved = style ?? liveStyle;
  const label = card.rank === "JOKER" ? "JKR" : card.rank;
  const isCourt = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  const isJoker = card.rank === "JOKER";
  const props: StyleProps = { card, label, isCourt, isJoker };

  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const tone: Tone = card.isWild ? "wild" : isRed ? "red" : "black";
  const isFoil = resolved === "foil";

  return (
    // `foil` is otherwise the exact Classic layout — the shimmer is an HTML
    // ::after overlay (globals.css's shared .foil-sweep, same technique
    // every other epic+ cosmetic uses), which needs a real HTML wrapper
    // around the <svg> since it can't attach to an inner <g>. `contents`
    // makes that wrapper a no-op for every other style — display:contents
    // takes it out of layout entirely, so nothing about sizing changes.
    <span className={isFoil ? "foil-sweep rarity-ring--epic relative block h-full w-full" : "contents"}>
      {/* viewBox carries a 5×7-unit transparent margin (same 5:7 ratio as the
      drawing) so nothing gets clipped by .card-face's border-radius —
      most visible on a large card on a wide screen. */}
      <svg viewBox="-5 -7 110 154" className="h-full w-full" aria-hidden="true">
        <g fill="currentColor" data-tone={tone}>
          {resolved === "realistic" ? (
            <RealisticFace {...props} />
          ) : resolved === "bold" ? (
            <BoldFace {...props} />
          ) : resolved === "minimal" ? (
            <MinimalFace {...props} />
          ) : resolved === "retro" ? (
            <RetroFace {...props} />
          ) : resolved === "pixel" ? (
            <PixelFace {...props} />
          ) : resolved === "outline" ? (
            <OutlineFace {...props} />
          ) : resolved === "shadow" ? (
            <ShadowFace {...props} />
          ) : resolved === "neon" ? (
            <NeonFace {...props} />
          ) : resolved === "deco" ? (
            <DecoFace {...props} />
          ) : resolved === "sketch" ? (
            <SketchFace {...props} />
          ) : resolved === "mono" ? (
            <MonoFace {...props} />
          ) : resolved === "ribbon" ? (
            <RibbonFace {...props} />
          ) : resolved === "halo" ? (
            <HaloFace {...props} />
          ) : resolved === "ledger" ? (
            <LedgerFace {...props} />
          ) : (
            // `classic` (the default) and `foil` share this exact layout —
            // foil is a shimmer overlay above, not a different drawing.
            <ClassicFace {...props} />
          )}
        </g>
      </svg>
    </span>
  );
}
