import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

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
        "src/deps/clients/tauri/playerRuntimePersistenceHost.js",
      ),
      output: {
        format: "iife",
        name: "RouteVNPlayerRuntimePersistenceHostBundle",
        entryFileNames: "player-runtime-persistence-host.js",
        inlineDynamicImports: true,
      },
    },
  },
});
