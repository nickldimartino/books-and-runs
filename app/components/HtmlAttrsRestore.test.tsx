import { describe, expect, it } from "vitest";
import { restoreHtmlAttrs } from "./HtmlAttrsRestore";

describe("restoreHtmlAttrs", () => {
  it("puts back attributes React cleared, and leaves existing ones alone", () => {
    const html = document.createElement("html");
    html.setAttribute("data-theme", "midnight"); // set again since the snapshot — keep
    restoreHtmlAttrs(
      { lang: "de", "data-theme": "daylight", "data-intro": "1", "data-seen-tips": "home", "data-started": "1" },
      html
    );
    expect(html.getAttribute("data-theme")).toBe("midnight");
    expect(html.getAttribute("data-intro")).toBe("1");
    expect(html.getAttribute("data-seen-tips")).toBe("home");
    expect(html.getAttribute("data-started")).toBe("1");
    expect(html.hasAttribute("lang")).toBe(false); // React owns lang
  });

  it("is a no-op without a snapshot", () => {
    const html = document.createElement("html");
    expect(() => restoreHtmlAttrs(undefined, html)).not.toThrow();
    expect(html.attributes.length).toBe(0);
  });
});
