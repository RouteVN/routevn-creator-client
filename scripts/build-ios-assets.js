import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const siteDir = join(rootDir, "_site");
const staticIOSDir = join(rootDir, "static", "ios");
const assetsDir = join(rootDir, "ios", "routevn", "routevn", "web");

const copyIfPresent = async (from, to) => {
  try {
    await cp(from, to, { recursive: true });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
};

await rm(assetsDir, { recursive: true, force: true });
await mkdir(assetsDir, { recursive: true });
const androidTemplateDir = join(assetsDir, "player-templates", "android");
await mkdir(androidTemplateDir, { recursive: true });
for (const filename of [
  "RouteVNPlayerTemplate.apk",
  "RouteVNPlayerTemplate.json",
]) {
  await cp(
    join(
      rootDir,
      "src-tauri",
      "assets",
      "player-templates",
      "android",
      filename,
    ),
    join(androidTemplateDir, filename),
  );
}
await copyIfPresent(join(siteDir, "public"), join(assetsDir, "public"));
await copyIfPresent(join(siteDir, "templates"), join(assetsDir, "templates"));
await copyIfPresent(join(siteDir, "bundle"), join(assetsDir, "bundle"));
await mkdir(join(assetsDir, "ios"), { recursive: true });
try {
  await cp(
    join(siteDir, "ios", "index.html"),
    join(assetsDir, "ios", "index.html"),
  );
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }

  await cp(
    join(staticIOSDir, "index.html"),
    join(assetsDir, "ios", "index.html"),
  );
}

console.log(`iOS WKWebView assets copied to ${assetsDir}`);
