import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Resolves the `@/*` -> `./src/*` alias from tsconfig so app/ tests can
  // import engine modules the same way the app does.
  plugins: [tsconfigPaths()],
  test: {
    projects: [
      {
        // The pure engine — fast, no DOM.
        extends: true,
        test: {
          name: "engine",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // React component / context tests.
        extends: true,
        test: {
          name: "app",
          include: ["app/**/*.test.tsx"],
          environment: "jsdom",
          // A real origin so window.localStorage exists (an opaque origin
          // leaves it undefined).
          environmentOptions: { jsdom: { url: "http://localhost:3000/" } },
          setupFiles: ["./test/setup.ts"],
        },
      },
    ],
  },
});
