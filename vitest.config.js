import { defineConfig } from "vitest/config";
import { putyPlugin } from "puty/vitest";

export default defineConfig({
  plugins: [putyPlugin()],
  test: {
    environment: "node",
    forceRerunTriggers: [
      "**/*.js",
      "**/*.{test,spec}.yaml",
      "**/*.{test,spec}.yml",
    ],
  },
});
