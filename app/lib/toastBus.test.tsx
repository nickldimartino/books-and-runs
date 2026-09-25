// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { MAX_TOASTS, pushToast } from "./toastBus";

describe("pushToast", () => {
  it("replaces a same-id toast in place instead of stacking duplicates", () => {
    const list = pushToast([{ id: "a", n: 1 }], { id: "a", n: 2 });
    expect(list).toEqual([{ id: "a", n: 2 }]);
  });
  it("keeps at most MAX_TOASTS, dropping the oldest", () => {
    let list: { id: string }[] = [];
    for (let i = 0; i < MAX_TOASTS + 2; i++) list = pushToast(list, { id: `t${i}` });
    expect(list).toHaveLength(MAX_TOASTS);
    expect(list[0].id).toBe("t2");
  });
});
