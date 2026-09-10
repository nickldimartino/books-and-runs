import { Card } from "@/types";

/**
 * The actual printed face of a playing card, drawn as one SVG (viewBox
 * 0 0 100 140, the ~5:7 of a real card) so it scales cleanly from the
 * 34px mini in the collapsed drawer up to the full hand card. Everything
 * paints with `fill="currentColor"`, so the suit colour comes straight
 * from `.card-face`'s own themed `color` (--card-text / --card-red /
 * --card-wild-text — see globals.css and PlayingCard.tsx's colorClass).
 *
 * Number cards get the traditional pip layout (with the lower-half pips
 * rotated 180°, the way a real card is printed so it reads upright from
 * either end); courts get a large rank letter over a watermark pip, plus a
 * crown for K/Q; the joker gets a star. No figurative court art — at this
 * size it wouldn't read, and a bold monogram-and-crown treatment says
 * "face card" clearly enough.
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

// Pip centres per rank. y > 70 is the lower half → that pip renders
// rotated 180°.
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

/** Draws one suit shape centred at (cx, cy), scaled to `size` units wide,
 * optionally flipped for a lower-half pip. */
function Pip({ suit, cx, cy, size, flip }: { suit: string; cx: number; cy: number; size: number; flip?: boolean }) {
  const s = size / 100;
  const rot = flip ? 180 : 0;
  return (
    <path
      d={SUIT_PATHS[suit]}
      transform={`translate(${cx} ${cy}) rotate(${rot}) scale(${s}) translate(-50 -50)`}
    />
  );
}

function CornerIndex({ label, suit }: { label: string; suit: string }) {
  return (
    <g>
      <text
        x="0"
        y="0"
        textAnchor="middle"
        fontSize={label.length > 1 ? 20 : 24}
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

export function CardFace({ card }: { card: Card }) {
  const isRed = card.suit === "hearts" || card.suit === "diamonds";
  const tone: Tone = card.isWild ? "wild" : isRed ? "red" : "black";
  const label = card.rank === "JOKER" ? "JKR" : card.rank;
  const isCourt = card.rank === "J" || card.rank === "Q" || card.rank === "K";
  const isJoker = card.rank === "JOKER";

  return (
    <svg viewBox="0 0 100 140" className="h-full w-full" aria-hidden="true">
      <g fill="currentColor" data-tone={tone}>
        {/* faint inner frame — reads as "printed card", costs one rect */}
        <rect x="3.5" y="3.5" width="93" height="133" rx="7" fill="none" stroke="currentColor" strokeOpacity="0.14" />

        {/* top-left index, and a 180°-rotated copy bottom-right */}
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
            {/* watermark pip behind the monogram */}
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
    </svg>
  );
}
