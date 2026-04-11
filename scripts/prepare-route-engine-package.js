import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const routeEnginePackageDir = path.join(
  projectRoot,
  "node_modules",
  "route-engine-js",
);

const routeEnginePackageJsonPath = path.join(
  routeEnginePackageDir,
  "package.json",
);
const routeEngineDistEntryPath = path.join(
  routeEnginePackageDir,
  "dist",
  "RouteEngine.js",
);

const createRouteEngineDistShim = async () => {
  if (
    !existsSync(routeEnginePackageJsonPath) ||
    existsSync(routeEngineDistEntryPath)
  ) {
    return;
  }

  const packageJson = JSON.parse(
    await readFile(routeEnginePackageJsonPath, "utf8"),
  );

  if (packageJson.name !== "route-engine-js") {
    return;
  }

  const srcEntryPath = path.join(
    routeEnginePackageDir,
    "src",
    "RouteEngine.js",
  );
  if (!existsSync(srcEntryPath)) {
    return;
  }

  await mkdir(path.dirname(routeEngineDistEntryPath), {
    recursive: true,
  });

  await writeFile(
    routeEngineDistEntryPath,
    [
      'export { default } from "../src/RouteEngine.js";',
      'export { default as createEffectsHandler } from "../src/createEffectsHandler.js";',
      'export { default as createIndexedDbPersistence } from "../src/indexedDbPersistence.js";',
      'export { resolveLayoutReferences } from "../src/resolveLayoutReferences.js";',
      "",
    ].join("\n"),
    "utf8",
  );
};

await createRouteEngineDistShim();
