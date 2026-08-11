"use client";

interface PassGateProps {
  name: string;
  onReveal: () => void;
}

export function PassGate({ name, onReveal }: PassGateProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="text-sm uppercase tracking-wide text-[var(--faint)]">Pass the device to</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--heading)]">{name}</h1>
      </div>
      <button
        onClick={onReveal}
        className="rounded-lg bg-[var(--accent)] px-8 py-3 text-base font-semibold text-[var(--on-accent)] shadow-lg transition hover:bg-[var(--accent-hover)]"
      >
        I&apos;m ready — show my hand
      </button>
    </main>
  );
}
