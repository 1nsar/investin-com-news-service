import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs before any test module is imported, so the config module sees a
    // complete environment. See test/setup.ts for why this is necessary.
    setupFiles: ["test/setup.ts"],
  },
});
