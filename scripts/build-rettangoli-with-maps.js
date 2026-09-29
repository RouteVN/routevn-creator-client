// @rettangoli/fe 1.4.3 hardcodes sourcemap:false and has no CLI override.
// Use its pinned Vite plugin and i18n emitter without changing the package.
import { readFile } from "node:fs/promises";
import { dirname, resolve, join, basename, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { load } from "js-yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = fileURLToPath(import.meta.resolve("@rettangoli/fe/cli"));
const cliDir = dirname(cliPath);
const packageRequire = createRequire(cliPath);
const { build } = await import(
  pathToFileURL(packageRequire.resolve("vite")).href
);
const { createRettangoliFeVitePlugin, RETTANGOLI_FE_VIRTUAL_ENTRY_ID } =
  await import(pathToFileURL(join(cliDir, "vitePlugin.js")).href);
const { emitI18nAssets, loadI18nBuildContext } = await import(
  pathToFileURL(join(cliDir, "i18nBuild.js")).href
);

const config = load(
  await readFile(join(root, "rettangoli.config.yaml"), "utf8"),
).fe;
const setup = process.argv[2];
if (!setup) throw new Error("Expected a frontend setup path");
const outfile = resolve(root, config.outfile);
const outDir = dirname(outfile);
const i18nContext = loadI18nBuildContext({
  cwd: root,
  i18n: config.i18n,
  errorPrefix: "[Build]",
});

await build({
  configFile: false,
  clearScreen: false,
  logLevel: "warn",
  root,
  base: "./",
  plugins: [
    createRettangoliFeVitePlugin({
      cwd: root,
      dirs: config.dirs,
      setup,
      i18n: config.i18n,
      errorPrefix: "[Build]",
    }),
  ],
  build: {
    outDir: relative(root, outDir),
    emptyOutDir: false,
    minify: "oxc",
    sourcemap: "hidden",
    target: "esnext",
    reportCompressedSize: false,
    rolldownOptions: {
      input: RETTANGOLI_FE_VIRTUAL_ENTRY_ID,
      output: {
        format: "es",
        entryFileNames: basename(outfile),
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
emitI18nAssets({ outDir, i18nContext });
