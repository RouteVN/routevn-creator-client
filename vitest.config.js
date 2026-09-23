import { configDefaults, defineConfig } from "vitest/config";
import { putyPlugin } from "puty/vitest";

export default defineConfig({
  plugins: [putyPlugin()],
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, ".artifacts/**"],
    forceRerunTriggers: [
      "**/*.js",
      "**/*.{test,spec}.yaml",
      "**/*.{test,spec}.yml",
    ],
  },
});
