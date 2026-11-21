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
      input: path.resolve(rootDir, "src/deps/clients/ios/playerRuntimeHost.js"),
      output: {
        format: "iife",
        name: "RouteVNPlayerRuntimePersistenceHostIOSBundle",
        entryFileNames: "player-runtime-persistence-host-ios.js",
        inlineDynamicImports: true,
      },
    },
  },
});
