import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const siteDir = join(rootDir, "_site");
const staticAndroidDir = join(rootDir, "static", "android");
const assetsDir = join(
  rootDir,
  "android",
  "routevn",
  "app",
  "src",
  "main",
  "assets",
);

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
await copyIfPresent(join(siteDir, "public"), join(assetsDir, "public"));
await copyIfPresent(join(siteDir, "templates"), join(assetsDir, "templates"));
await copyIfPresent(join(siteDir, "bundle"), join(assetsDir, "bundle"));
await mkdir(join(assetsDir, "web"), { recursive: true });
try {
  await cp(
    join(siteDir, "android", "index.html"),
    join(assetsDir, "web", "index.html"),
  );
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }

  await cp(
    join(staticAndroidDir, "index.html"),
    join(assetsDir, "web", "index.html"),
  );
}

console.log(`Android WebView assets copied to ${assetsDir}`);
