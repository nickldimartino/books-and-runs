"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  color: string;
  width: number;
  height: number;
  shape: "rect" | "circle";
}

const DURATION_MS = 2400;
const PARTICLE_COUNT = 140;
const GRAVITY = 0.02;

// Read straight from the page's own live CSS custom properties rather than a
// hardcoded palette — this fires from GameOverScreen, which (like every
// other screen) can be showing any of the 38 themes, and confetti in a
// color scheme that clashes with whatever table the player picked would
// read as generic rather than belonging to this specific game.
function themeColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();
  return [read("--accent"), read("--accent-hover"), read("--heading"), read("--highlight")].filter(Boolean);
}

/**
 * A short, self-contained confetti burst for the one moment this game
 * actually builds to (see GameOverScreen) — canvas-based rather than one DOM
 * node per particle, since 100+ independently animated elements is exactly
 * the case canvas exists for. Fires once on mount; the animation loop simply
 * stops recursing once it's run its course, leaving a cleared, inert
 * (`pointer-events: none` throughout) canvas behind rather than needing its
 * own unmount choreography. Renders nothing at all under
 * `prefers-reduced-motion` — the entire point of this component is motion,
 * so there's no meaningful "less" version of it to fall back to.
 */
export function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const colors = themeColors();
    if (colors.length === 0) return;

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Launched from a band above the top of the screen at staggered
    // heights (not all from y=0) so the burst doesn't read as a single flat
    // line dropping in unison — closer to a real handful of confetti
    // already mid-air when it starts falling.
    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }, () => {
      const width = 6 + Math.random() * 5;
      return {
        x: Math.random() * canvas!.width,
        y: -20 - Math.random() * canvas!.height * 0.5,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 2.5,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        width,
        height: width * 0.4,
        shape: Math.random() < 0.5 ? "rect" : "circle",
      };
    });

    const start = performance.now();
    let rafId: number;

    function frame(now: number) {
      const elapsed = now - start;
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      // Only starts fading in the final 30% of the burst — a particle that
      // faded the whole way down would look dim in flight instead of
      // vanishing at the end.
      const fadeStart = DURATION_MS * 0.7;
      const opacity =
        elapsed < fadeStart ? 1 : Math.max(0, 1 - (elapsed - fadeStart) / (DURATION_MS - fadeStart));
      for (const p of particles) {
        p.vy += GRAVITY;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        ctx!.save();
        ctx!.globalAlpha = opacity;
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.rotation);
        ctx!.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx!.beginPath();
          ctx!.arc(0, 0, p.width / 2, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
        }
        ctx!.restore();
      }
      if (elapsed < DURATION_MS) rafId = requestAnimationFrame(frame);
    }
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60]" />;
}
