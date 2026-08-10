"use client";

interface PassGateProps {
  name: string;
  onReveal: () => void;
}

export function PassGate({ name, onReveal }: PassGateProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <p className="text-sm uppercase tracking-wide text-emerald-100/60">Pass the device to</p>
        <h1 className="mt-2 text-3xl font-bold text-amber-100">{name}</h1>
      </div>
      <button
        onClick={onReveal}
        className="rounded-lg bg-amber-400 px-8 py-3 text-base font-semibold text-emerald-950 shadow-lg transition hover:bg-amber-300"
      >
        I&apos;m ready — show my hand
      </button>
    </main>
  );
}
