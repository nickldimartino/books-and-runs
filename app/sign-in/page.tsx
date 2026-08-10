"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../AuthContext";

export default function SignInPage() {
  const router = useRouter();
  const { configured, user, signInWithPassword, signUpWithPassword, signInWithGoogle, signInWithApple } =
    useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  if (!configured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold text-amber-100">Sign in isn&apos;t set up yet</h1>
        <p className="text-sm text-emerald-100/70">
          This app doesn&apos;t have a Supabase project connected. Local pass-and-play games work
          fine without one — accounts and stats just aren&apos;t available yet.
        </p>
        <button
          onClick={() => router.replace("/")}
          className="mt-2 rounded-lg border border-emerald-100/20 px-6 py-3 text-sm font-medium text-emerald-100/80 hover:bg-emerald-900/40"
        >
          Back to Home
        </button>
      </main>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result =
      mode === "sign-in" ? await signInWithPassword(email, password) : await signUpWithPassword(email, password);
    setPending(false);
    if (result.error) {
      setError(result.error);
    } else if (mode === "sign-up") {
      setCheckEmail(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-10">
      <h1 className="text-center text-2xl font-bold text-amber-100">Sign in</h1>

      {checkEmail ? (
        <p className="text-center text-sm text-emerald-100/80">
          Check your email to confirm your account, then come back and sign in.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => signInWithGoogle().then((r) => r.error && setError(r.error))}
              className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-emerald-950 shadow hover:bg-emerald-50"
            >
              Continue with Google
            </button>
            <button
              onClick={() => signInWithApple().then((r) => r.error && setError(r.error))}
              className="rounded-lg bg-black px-6 py-3 text-sm font-semibold text-white shadow hover:bg-neutral-900"
            >
              Continue with Apple
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-emerald-100/40">
            <div className="h-px flex-1 bg-emerald-100/20" />
            or
            <div className="h-px flex-1 bg-emerald-100/20" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg bg-emerald-950 px-4 py-3 text-sm text-amber-100 outline-none ring-1 ring-emerald-100/20 focus:ring-amber-400"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg bg-emerald-950 px-4 py-3 text-sm text-amber-100 outline-none ring-1 ring-emerald-100/20 focus:ring-amber-400"
            />
            {error && <p className="text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-amber-400 px-6 py-3 text-sm font-semibold text-emerald-950 shadow disabled:opacity-50"
            >
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => {
              setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
              setError(null);
            }}
            className="text-center text-sm text-emerald-100/60 hover:text-emerald-100"
          >
            {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
          </button>

          <p className="text-center text-xs text-emerald-100/40">
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline hover:text-emerald-100/70">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-emerald-100/70">
              Privacy Policy
            </Link>
            .
          </p>
        </>
      )}
    </main>
  );
}
