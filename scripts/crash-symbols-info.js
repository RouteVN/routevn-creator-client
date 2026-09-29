import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(resolve(root, path), "utf8");

const platform = process.argv[2];
if (
  !new Set(["web", "macos", "linux", "windows", "ios", "android"]).has(platform)
) {
  throw new Error("Expected web, macos, linux, windows, ios, or android");
}

const uniqueValue = (source, expression, label) => {
  const matches = [...source.matchAll(expression)].map((match) => match[1]);
  const values = [...new Set(matches)];
  if (values.length !== 1) throw new Error(`Expected one ${label}`);
  return values[0];
};

let version;
let dist;
if (platform === "ios") {
  const project = source("ios/routevn/routevn.xcodeproj/project.pbxproj");
  version = uniqueValue(
    project,
    /MARKETING_VERSION = ([\d.]+);/g,
    "iOS version",
  );
  dist = uniqueValue(
    project,
    /CURRENT_PROJECT_VERSION = (\d+);/g,
    "iOS build number",
  );
} else if (platform === "android") {
  const gradle = source("android/routevn/app/build.gradle.kts");
  version = uniqueValue(gradle, /versionName = "([\d.]+)"/g, "Android version");
  dist = uniqueValue(gradle, /versionCode = (\d+)/g, "Android version code");
} else {
  version = JSON.parse(source("src-tauri/tauri.conf.json")).version;
  const override = process.env.ROUTEVN_BUILD_ID;
  const revision =
    (override?.length ? override : undefined) ??
    execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  const distribution =
    process.env.VITE_ROUTEVN_DISTRIBUTION === "steam" ? "steam" : "direct";
  dist =
    platform === "web" ? revision : `${revision}-${platform}-${distribution}`;
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(dist))
    throw new Error("Invalid crash-reporting dist");
}

console.log(`routevn-creator@${version}\t${dist}`);
