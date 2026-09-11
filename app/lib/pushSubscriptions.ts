// Web Push opt-in — "notify me when it's my turn" (Settings page). The
// actual send happens server-side, from the `mp` Edge Function's addEvent()
// whenever it records a your_turn/game_request/nudge event; this file is
// just the browser half: register the service worker (public/sw.js, which
// also handles offline shell caching), ask for permission, subscribe with
// PushManager, and keep the subscription row in `push_subscriptions`
// (migration 0020) in step with what the browser actually holds.
//
// Every function here is a no-op-returning-false/null on an unsupported
// browser (Safari on non-homescreen iOS, insecure contexts, etc.) rather
// than throwing — this is a nicety layered on top of the "check back"
// flow, never something a caller needs to guard the whole feature behind.

import type { SupabaseClient } from "@supabase/supabase-js";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    typeof Notification !== "undefined"
  );
}

/**
 * True when the reason isPushSupported() is false is specifically "this is
 * iOS/iPadOS Safari, opened as a regular browser tab" — Apple's Push API
 * (unlike every other engine's) doesn't exist at all outside a page that's
 * been added to the Home Screen and opened from there, so "not supported"
 * on its own leaves this — by far the most common way anyone actually
 * hits that state — with no way to tell "this device can never do this"
 * apart from "you're just not looking at it the right way yet".
 */
export function isIosSafariNonStandalone(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a Mac unless you also check for touch support.
    (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches;
  return !standalone;
}

/** `Notification.permission`, or "unsupported" when the API doesn't exist
 * at all — lets the Settings toggle render a real state either way instead
 * of assuming "default". */
export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch (err) {
    console.error("Failed to register the service worker:", err);
    return null;
  }
}

// PushManager wants the VAPID public key as a raw Uint8Array, not the
// base64url string it's normally shared as. Built via `new Uint8Array(n)` +
// a fill loop rather than Uint8Array.from(...) — the latter's inferred
// generic (Uint8Array<ArrayBufferLike>) doesn't satisfy BufferSource under
// this TS/lib version, even though the runtime value is identical.
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Whether *this browser* currently holds a push subscription — a quick,
 * non-prompting check for the Settings toggle's initial state. Doesn't
 * confirm the row still exists server-side (a signed-out cleanup elsewhere
 * could have deleted it); subscribeToPush() re-upserts either way, so that
 * only matters if the user expects the toggle to reflect a delete that
 * happened on a *different* device, which it deliberately doesn't. */
export async function isPushSubscribed(): Promise<boolean> {
  if (!isPushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}

export interface SubscribeResult {
  ok: boolean;
  /** "denied" | "unsupported" | a short message — for the Settings page to
   * show something more useful than a generic failure. */
  reason?: string;
}

/** Registers the service worker, asks for Notification permission if
 * needed, subscribes with PushManager, and upserts the subscription row.
 * Safe to call again on an already-subscribed browser — resolves the same
 * PushSubscription and just re-upserts. */
export async function subscribeToPush(supabase: SupabaseClient, userId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { ok: false, reason: "unsupported" };
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: "Push isn't configured on this deployment yet." };

  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: "Couldn't register the service worker." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };

  let sub: PushSubscription;
  try {
    sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      }));
  } catch (err) {
    console.error("PushManager.subscribe failed:", err);
    return { ok: false, reason: "Couldn't subscribe with this browser." };
  }

  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const authKey = json.keys?.auth;
  if (!json.endpoint || !p256dh || !authKey) return { ok: false, reason: "Malformed subscription." };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: userId, endpoint: json.endpoint, p256dh, auth_key: authKey }, { onConflict: "endpoint" });
  if (error) {
    console.error("Failed to save the push subscription:", error);
    return { ok: false, reason: "Couldn't save the subscription." };
  }
  return { ok: true };
}

/** Unsubscribes this browser and removes its row — "off" in Settings.
 * Best-effort on the row delete: an unreachable Supabase shouldn't block
 * the browser-side unsubscribe the player actually asked for. */
export async function unsubscribeFromPush(supabase: SupabaseClient): Promise<void> {
  if (!isPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) console.error("Failed to remove the push subscription row:", error);
  } catch (err) {
    console.error("Failed to unsubscribe from push:", err);
  }
}
