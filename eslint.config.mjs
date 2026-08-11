import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";

// typescript-eslint doesn't support this repo's TypeScript 7 (preview) yet
// (https://github.com/typescript-eslint/typescript-eslint/issues/10940), so
// TS/TSX files are parsed with Babel instead — syntax-only, no type-aware
// rules, but enough for react-hooks and @next/next's static checks.
const eslintConfig = defineConfig([
  {
    files: ["**/*.{js,jsx,ts,tsx,mjs}"],
    languageOptions: {
      parser: await import("@babel/eslint-parser"),
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-react", "@babel/preset-typescript"],
        },
      },
    },
    plugins: {
      "@next/next": nextPlugin,
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    settings: {
      react: { version: "detect" },
      next: { rootDir: "." },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs["jsx-runtime"].rules,
      // Only the two long-established hook rules — the rest of this
      // plugin's "recommended" set is the experimental React Compiler
      // readiness ruleset, which flags idiomatic, working patterns (e.g.
      // derived state via a ref check during render) that don't need to
      // change for this app.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
    },
  },
  globalIgnores([".next/**", "out/**", "dist/**", "ios/**", "next-env.d.ts"]),
]);

export default eslintConfig;
