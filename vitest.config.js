import { defineConfig } from "vitest/config";
import { putyPlugin } from "puty/vitest";

export default defineConfig({
  plugins: [putyPlugin()],
  test: {
    environment: "node",
    // Many tests import modules inside the test, and the first import in a
    // file loads its whole module graph. That takes well under a second
    // normally, but on a busy machine it has gone past the default 5 s.
    testTimeout: 20_000,
    forceRerunTriggers: [
      "**/*.js",
      "**/*.{test,spec}.yaml",
      "**/*.{test,spec}.yml",
    ],
  },
});
