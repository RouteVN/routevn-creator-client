import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export default defineConfig({
  root: rootDir,
  publicDir: false,
  build: {
    outDir: path.resolve(rootDir, "static/bundle"),
    emptyOutDir: false,
    minify: "esbuild",
    sourcemap: false,
    target: "esnext",
    rollupOptions: {
      input: path.resolve(
        rootDir,
        "src/deps/clients/android/playerRuntimeHost.js",
      ),
      output: {
        format: "iife",
        name: "RouteVNPlayerRuntimePersistenceHostAndroidBundle",
        entryFileNames: "player-runtime-persistence-host-android.js",
        inlineDynamicImports: true,
      },
    },
  },
});
