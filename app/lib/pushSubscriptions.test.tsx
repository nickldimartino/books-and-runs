// @vitest-environment jsdom

// Tests the browser half of Web Push against faked serviceWorker/
// PushManager/Notification globals and a stub Supabase client — the actual
// send happens server-side (mp Edge Function), out of reach here.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPushPermission,
  isPushSubscribed,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "./pushSubscriptions";

class FakeSubscription {
  endpoint = "https://push.example/abc123";
  unsubscribed = false;
  toJSON() {
    return { endpoint: this.endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } };
  }
  async unsubscribe() {
    this.unsubscribed = true;
    return true;
  }
}

class FakePushManager {
  subscription: FakeSubscription | null = null;
  lastSubscribeOptions: unknown = null;
  async getSubscription() {
    return this.subscription;
  }
  async subscribe(options: unknown) {
    this.lastSubscribeOptions = options;
    this.subscription = new FakeSubscription();
    return this.subscription;
  }
}

function installBrowserApis({ permission = "default" as NotificationPermission } = {}) {
  const registration = { pushManager: new FakePushManager() };
  const register = vi.fn(async () => registration);
  const getRegistration = vi.fn(async () => registration);
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: { register, getRegistration },
    configurable: true,
  });
  (window as unknown as { PushManager: unknown }).PushManager = class {};
  const requestPermission = vi.fn(async () => "granted" as NotificationPermission);
  (globalThis as unknown as { Notification: unknown }).Notification = { permission, requestPermission };
  return { registration, register, getRegistration, requestPermission };
}

function fakeSupabase() {
  const upserts: { table: string; row: Record<string, unknown>; opts: unknown }[] = [];
  const deletes: { table: string; column: string; value: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>, opts: unknown) => {
        upserts.push({ table, row, opts });
        return { error: null };
      },
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          deletes.push({ table, column, value });
          return { error: null };
        },
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, upserts, deletes };
}

const ORIGINAL_VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BBiTgmcEZKdg-sCJrqhGVKn4A9xiP5mgeblH1Yd8nMFkQlVP_mgW_hsctIIUohUZ";
});
afterEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = ORIGINAL_VAPID;
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window as unknown as Record<string, unknown>, "PushManager");
});

describe("isPushSupported / getPushPermission", () => {
  it("reports unsupported when the browser has none of the APIs", () => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, "PushManager");
    expect(isPushSupported()).toBe(false);
    expect(getPushPermission()).toBe("unsupported");
  });

  it("reports the real permission once every API is present", () => {
    installBrowserApis({ permission: "denied" });
    expect(isPushSupported()).toBe(true);
    expect(getPushPermission()).toBe("denied");
  });
});

describe("isPushSubscribed", () => {
  it("false with no existing subscription", async () => {
    installBrowserApis();
    expect(await isPushSubscribed()).toBe(false);
  });

  it("true once the registration already holds one", async () => {
    const { registration } = installBrowserApis();
    await registration.pushManager.subscribe({});
    expect(await isPushSubscribed()).toBe(true);
  });
});

describe("subscribeToPush", () => {
  it("fails fast when unsupported", async () => {
    Reflect.deleteProperty(window as unknown as Record<string, unknown>, "PushManager");
    const { client } = fakeSupabase();
    const result = await subscribeToPush(client, "u1");
    expect(result).toEqual({ ok: false, reason: "unsupported" });
  });

  it("fails with a clear reason when no VAPID key is configured", async () => {
    installBrowserApis();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "";
    const { client } = fakeSupabase();
    const result = await subscribeToPush(client, "u1");
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not.*configured|isn't configured/i);
  });

  it("reports denied without ever calling PushManager.subscribe", async () => {
    const { registration } = installBrowserApis({ permission: "default" });
    registration.pushManager.subscribe = vi.fn();
    (globalThis as unknown as { Notification: { requestPermission: () => Promise<string> } }).Notification.requestPermission =
      vi.fn(async () => "denied");
    const { client } = fakeSupabase();

    const result = await subscribeToPush(client, "u1");

    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("subscribes and upserts the row with the right shape on success", async () => {
    installBrowserApis({ permission: "default" });
    const { client, upserts } = fakeSupabase();

    const result = await subscribeToPush(client, "user-123");

    expect(result).toEqual({ ok: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      table: "push_subscriptions",
      row: {
        user_id: "user-123",
        endpoint: "https://push.example/abc123",
        p256dh: "p256dh-value",
        auth_key: "auth-value",
      },
      opts: { onConflict: "endpoint" },
    });
  });

  it("converts the VAPID public key to a Uint8Array of the decoded byte length", async () => {
    const { registration } = installBrowserApis({ permission: "default" });
    const { client } = fakeSupabase();

    await subscribeToPush(client, "u1");

    const opts = registration.pushManager.lastSubscribeOptions as {
      userVisibleOnly: boolean;
      applicationServerKey: Uint8Array;
    };
    expect(opts.userVisibleOnly).toBe(true);
    expect(opts.applicationServerKey).toBeInstanceOf(Uint8Array);
    // atob() of the configured key decodes to this many raw bytes.
    expect(opts.applicationServerKey.length).toBe(
      atob(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!.replace(/-/g, "+").replace(/_/g, "/")).length
    );
  });

  it("reuses an already-existing subscription instead of subscribing again", async () => {
    const { registration } = installBrowserApis({ permission: "default" });
    const existing = await registration.pushManager.subscribe({});
    const subscribeSpy = vi.spyOn(registration.pushManager, "subscribe");
    const { client, upserts } = fakeSupabase();

    const result = await subscribeToPush(client, "u1");

    expect(result.ok).toBe(true);
    expect(subscribeSpy).not.toHaveBeenCalled();
    expect(upserts[0].row.endpoint).toBe(existing.endpoint);
  });
});

describe("unsubscribeFromPush", () => {
  it("unsubscribes the browser and deletes the row by endpoint", async () => {
    const { registration } = installBrowserApis();
    const sub = await registration.pushManager.subscribe({});
    const { client, deletes } = fakeSupabase();

    await unsubscribeFromPush(client);

    expect(sub.unsubscribed).toBe(true);
    expect(deletes).toEqual([{ table: "push_subscriptions", column: "endpoint", value: sub.endpoint }]);
  });

  it("is a no-op with nothing subscribed", async () => {
    installBrowserApis();
    const { client, deletes } = fakeSupabase();

    await unsubscribeFromPush(client);

    expect(deletes).toHaveLength(0);
  });
});
