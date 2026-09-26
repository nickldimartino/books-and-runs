// Source scanner: fails on hardcoded user-visible English in app/**/*.tsx.
// Flags (1) JSX text nodes containing letters, and (2) string-literal values
// of aria-label / title / placeholder / alt / label attributes (also inside
// ternaries and ||/?? fallbacks). Uses @babel/parser (TypeScript 7 no longer ships a JS compiler API), no browser.
// Legitimate cases go in hardcodedAllowlist.ts with a reason.
// Run alone with `npm run i18n:check`. See AGENTS.md "Adding user-visible text".
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import { HARDCODED_ALLOWLIST, ALLOWLIST_FILES } from "./hardcodedAllowlist";

const APP_DIR = path.resolve(__dirname, "../..");
const ATTRS = new Set(["aria-label", "title", "placeholder", "alt", "label"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dictionaries") continue;
      walk(p, out);
    } else if (e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

type N = any;

/** String-literal leaves an attribute expression could evaluate to. */
function literalLeaves(node: N): string[] {
  if (!node) return [];
  switch (node.type) {
    case "StringLiteral":
      return [node.value];
    case "TemplateLiteral":
      return node.expressions.length === 0 ? [node.quasis[0].value.cooked ?? ""] : [];
    case "ParenthesizedExpression":
      return literalLeaves(node.expression);
    case "ConditionalExpression":
      return [...literalLeaves(node.consequent), ...literalLeaves(node.alternate)];
    case "LogicalExpression":
      return [...literalLeaves(node.left), ...literalLeaves(node.right)];
    default:
      return [];
  }
}

const hasWords = (s: string) => /\p{L}{2,}/u.test(s.replace(/&\w+;|&#\d+;/g, ""));

export function scan(): { file: string; line: number; kind: string; text: string }[] {
  const found: { file: string; line: number; kind: string; text: string }[] = [];
  for (const file of walk(APP_DIR)) {
    const rel = path.relative(APP_DIR, file).split(path.sep).join("/");
    if (ALLOWLIST_FILES[rel]) continue;
    const ast = parse(fs.readFileSync(file, "utf8"), { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
    const report = (n: N, kind: string, text: string) => {
      const t = text.replace(/\s+/g, " ").trim();
      if (!hasWords(t)) return;
      if (HARDCODED_ALLOWLIST.some((a) => a.file === rel && (a.text === t || (a.text.endsWith("*") && t.startsWith(a.text.slice(0, -1)))))) return;
      found.push({ file: rel, line: n.loc.start.line, kind, text: t });
    };
    const visit = (n: N, parent?: N) => {
      if (!n || typeof n.type !== "string") return;
      if (n.type === "JSXText") report(n, "jsx-text", n.value);
      else if (n.type === "JSXExpressionContainer" && parent?.type !== "JSXAttribute") {
        // {"literal"} / {cond ? "a" : "b"} used as a JSX child.
        for (const l of literalLeaves(n.expression)) report(n, "jsx-expression-text", l);
      } else if (
        n.type === "CallExpression" &&
        n.callee.type === "Identifier" &&
        /^(set(Error|Message|Status|Notice|Toast|Info|Msg|Feedback)|showToast|toast)$/.test(n.callee.name)
      ) {
        // Assigning a literal sentence to user-visible state: setError("Something went wrong").
        for (const a of n.arguments) for (const l of literalLeaves(a)) if (/\s/.test(l.trim())) report(n, `${n.callee.name}()`, l);
      } else if (n.type === "JSXAttribute" && n.name.type === "JSXIdentifier" && ATTRS.has(n.name.name) && n.value) {
        const v = n.value;
        const lits = v.type === "StringLiteral" ? [v.value] : v.type === "JSXExpressionContainer" ? literalLeaves(v.expression) : [];
        for (const l of lits) report(n, `attr ${n.name.name}`, l);
      }
      for (const key of Object.keys(n)) {
        if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
        const c = n[key];
        if (Array.isArray(c)) c.forEach((x) => visit(x, n));
        else if (c && typeof c === "object") visit(c, n);
      }
    };
    visit(ast.program);
  }
  return found;
}

describe("no hardcoded user-visible English in app/**/*.tsx", () => {
  it("every JSX text node and label-ish attribute goes through t()", () => {
    const found = scan();
    const msg = found.map((f) => `  ${f.file}:${f.line}  [${f.kind}]  ${JSON.stringify(f.text)}`).join("\n");
    expect(
      found.length,
      `Hardcoded visible text found. Use t("...") (add the key to en.ts + all 9 locales), or add a reasoned entry to app/lib/i18n/hardcodedAllowlist.ts:\n${msg}\n`,
    ).toBe(0);
  });

  it("allowlist has no stale entries", () => {
    const stale: string[] = [];
    for (const a of HARDCODED_ALLOWLIST) {
      const p = path.join(APP_DIR, a.file);
      if (!fs.existsSync(p)) stale.push(`${a.file} (file gone)`);
    }
    for (const f of Object.keys(ALLOWLIST_FILES)) if (!fs.existsSync(path.join(APP_DIR, f))) stale.push(`${f} (file gone)`);
    expect(stale).toEqual([]);
  });
});
