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
      input: path.resolve(rootDir, "scripts/main.js"),
      output: {
        format: "es",
        entryFileNames: "main.js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        inlineDynamicImports: true,
      },
    },
  },
});
