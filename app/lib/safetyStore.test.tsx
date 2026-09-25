import { describe, expect, it, vi } from "vitest";
import {
  blockUser,
  cleanReportNote,
  ContentRejectedError,
  contentRejectionFromServer,
  contentRejectionKey,
  getMyBlocks,
  kindForReason,
  MAX_REPORT_NOTE_LENGTH,
  reportUser,
  unblockUser,
} from "./safetyStore";

function fakeClient(result: { data?: unknown; error?: unknown } = {}) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc } as never, rpc };
}

describe("block list RPCs", () => {
  it("calls block/unblock and maps my_blocks rows", async () => {
    const { client, rpc } = fakeClient({ data: [{ user_id: "u1", display_name: "Zed", blocked_at: "2026-09-25" }] });
    await blockUser(client, "u1");
    await unblockUser(client, "u1");
    expect(rpc).toHaveBeenCalledWith("block_user", { p_user: "u1" });
    expect(rpc).toHaveBeenCalledWith("unblock_user", { p_user: "u1" });
    expect(await getMyBlocks(client)).toEqual([{ userId: "u1", displayName: "Zed", blockedAt: "2026-09-25" }]);
  });
  it("throws the RPC error", async () => {
    const { client } = fakeClient({ error: new Error("nope") });
    await expect(blockUser(client, "u1")).rejects.toThrow("nope");
  });
});

describe("reportUser", () => {
  it("derives kind from the reason, cleans the note and passes context", async () => {
    const { client, rpc } = fakeClient();
    await reportUser(client, {
      reportedUserId: "u2",
      reason: "harassment",
      note: "  rude ‮ chat\u0007  ",
      gameId: "g1",
      context: "mp_game",
    });
    expect(rpc).toHaveBeenCalledWith("report_user", {
      p_reported_user_id: "u2",
      p_kind: "behavior",
      p_reason: "harassment",
      p_note: "rude  chat",
      p_game_id: "g1",
      p_context: "mp_game",
    });
  });
  it("maps reasons to kinds and caps/empties notes", () => {
    expect(kindForReason("inappropriate_photo")).toBe("photo");
    expect(kindForReason("impersonation")).toBe("name");
    expect(kindForReason("other")).toBe("other");
    expect(cleanReportNote("   ")).toBeNull();
    expect(cleanReportNote(null)).toBeNull();
    expect(cleanReportNote("x".repeat(1000))?.length).toBe(MAX_REPORT_NOTE_LENGTH);
  });
});

describe("content rejection", () => {
  it("recognises the database trigger's messages", () => {
    expect(contentRejectionFromServer("That name isn't allowed", "name")).toMatchObject({ issue: "profanity", kind: "name" });
    expect(contentRejectionFromServer("That bio isn't allowed", "bio")).toMatchObject({ issue: "profanity", kind: "bio" });
    expect(contentRejectionFromServer("That name is reserved", "name")).toMatchObject({ issue: "impersonation" });
    expect(contentRejectionFromServer("Links aren't allowed here", "bio")).toMatchObject({ issue: "link", kind: "bio" });
    expect(contentRejectionFromServer("duplicate key value", "name")).toBeNull();
    expect(contentRejectionFromServer(undefined, "name")).toBeNull();
  });
  it("picks a translation key per issue", () => {
    expect(contentRejectionKey("profanity", "name")).toBe("safety.content.name");
    expect(contentRejectionKey("profanity", "bio")).toBe("safety.content.bio");
    expect(contentRejectionKey("link", "bio")).toBe("safety.content.link");
    expect(contentRejectionKey("impersonation", "name")).toBe("safety.content.reserved");
    expect(new ContentRejectedError("link", "bio").message).toMatch(/Links/);
  });
});
