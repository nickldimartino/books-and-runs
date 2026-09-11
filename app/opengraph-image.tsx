import { ImageResponse } from "next/og";

// The link-preview card (og:image / twitter:image). Generated to a static
// PNG at build time — no runtime, works with `output: "export"`.
export const dynamic = "force-static";
export const alt = "Books & Runs — a free Contract Rummy card game";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const CARDS = [
  { s: "♠", dx: -300, rot: -14, red: false },
  { s: "♠", dx: -160, rot: -8, red: false },
  { s: "♠", dx: -20, rot: -2, red: false },
  { s: "♥", dx: 120, rot: 4, red: true },
  { s: "♦", dx: 260, rot: 12, red: true },
];

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #0c3325 0%, #08251c 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ position: "relative", display: "flex", width: 700, height: 240 }}>
          {CARDS.map((c, i) => (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 350 + c.dx - 62,
                top: 30,
                width: 124,
                height: 174,
                borderRadius: 16,
                background: "#f6f1e4",
                color: c.red ? "#c0392b" : "#1f2d27",
                fontSize: 64,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `rotate(${c.rot}deg)`,
                boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
              }}
            >
              {c.s}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 40, fontSize: 92, fontWeight: 800, color: "#fef3c7" }}>
          Books &amp; Runs
        </div>
        <div style={{ marginTop: 12, fontSize: 30, color: "rgba(209,250,229,0.75)" }}>
          A free Contract Rummy card game
        </div>
      </div>
    ),
    { ...size }
  );
}
