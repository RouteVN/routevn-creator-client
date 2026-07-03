#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const packageName = "routevn-creator";
const displayName = "RouteVN Creator";
const forbiddenPackageName = "route-vn-creator";
const forbiddenCopy = "Join our Discord server to stay updated.";
const expectedCopy = "Follow us on social media to stay updated.";

const args = new Set(process.argv.slice(2));
const failures = [];

function repoPath(relativePath) {
  return path.join(repoRoot, relativePath);
}

function readText(relativePath) {
  return fs.readFileSync(repoPath(relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fail(message) {
  failures.push(message);
}

function expect(condition, message) {
  if (!condition) {
    fail(message);
  }
}

function scanTextFile(relativePath) {
  const contents = readText(relativePath);

  expect(
    !contents.includes(forbiddenPackageName),
    `${relativePath} contains forbidden package name ${forbiddenPackageName}`,
  );
  expect(
    !contents.includes(forbiddenCopy),
    `${relativePath} contains stale Discord update copy`,
  );
}

function collectFiles(directory, predicate) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath, predicate));
    } else if (predicate(entryPath)) {
      files.push(entryPath);
    }
  }

  return files;
}

function inspectBinary(filePath) {
  const contents = fs.readFileSync(filePath);

  expect(
    !contents.includes(Buffer.from(forbiddenPackageName)),
    `${path.relative(repoRoot, filePath)} contains forbidden package name ${forbiddenPackageName}`,
  );
  expect(
    !contents.includes(Buffer.from(forbiddenCopy)),
    `${path.relative(repoRoot, filePath)} contains stale Discord update copy`,
  );
  expect(
    contents.includes(Buffer.from(packageName)),
    `${path.relative(repoRoot, filePath)} does not contain package name ${packageName}`,
  );
}

function inspectArtifact(kind, extension) {
  const tauriConfig = readJson("src-tauri/tauri.conf.json");
  const bundleDirectory = repoPath(`src-tauri/target/release/bundle/${kind}`);
  const artifacts = collectFiles(
    bundleDirectory,
    (filePath) =>
      path
        .basename(filePath)
        .startsWith(`${packageName}-${tauriConfig.version}`) &&
      filePath.endsWith(extension),
  );

  expect(
    artifacts.length > 0,
    `No ${kind} artifact found for ${packageName} ${tauriConfig.version}`,
  );

  for (const artifact of artifacts) {
    inspectBinary(artifact);
  }
}

const sourceFiles = [
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/tauri.prod.conf.json",
  "src-tauri/tauri.linux.conf.json",
  "src-tauri/tauri.linux-packages.conf.json",
  "src-tauri/assets/com.routevn.creator.metainfo.xml",
  "src-tauri/assets/linux-desktop.desktop.hbs",
  "packaging/aur/PKGBUILD",
  "packaging/aur/.SRCINFO",
];

for (const sourceFile of sourceFiles) {
  scanTextFile(sourceFile);
}

const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const linuxConfig = readJson("src-tauri/tauri.linux.conf.json");
const metainfo = readText("src-tauri/assets/com.routevn.creator.metainfo.xml");
const desktopTemplate = readText("src-tauri/assets/linux-desktop.desktop.hbs");
const aurPkgbuild = readText("packaging/aur/PKGBUILD");

expect(
  packageJson.description.includes(expectedCopy),
  "package.json description does not use social media update copy",
);
expect(
  tauriConfig.productName === displayName,
  `Base Tauri productName must stay ${displayName}`,
);
expect(
  tauriConfig.mainBinaryName === packageName,
  `Tauri mainBinaryName must be ${packageName}`,
);
expect(
  tauriConfig.bundle.longDescription.includes(expectedCopy),
  "Tauri longDescription does not use social media update copy",
);
expect(
  linuxConfig.productName === packageName,
  `Linux Tauri productName must be ${packageName}`,
);
expect(
  metainfo.includes(`<name>${displayName}</name>`),
  "AppStream metainfo display name is wrong",
);
expect(
  metainfo.includes(
    '<launchable type="desktop-id">routevn-creator.desktop</launchable>',
  ),
  "AppStream launchable desktop id must be routevn-creator.desktop",
);
expect(
  metainfo.includes("<binary>routevn-creator</binary>"),
  "AppStream binary must be routevn-creator",
);
expect(
  metainfo.includes(expectedCopy),
  "AppStream description does not use social media update copy",
);
expect(
  desktopTemplate.includes(`Name=${displayName}`),
  "Linux desktop template display name is wrong",
);
expect(
  aurPkgbuild.includes("pkgname=routevn-creator"),
  "AUR pkgname must be routevn-creator",
);
expect(
  aurPkgbuild.includes("/usr/share/applications/routevn-creator.desktop"),
  "AUR desktop file must be routevn-creator.desktop",
);

if (args.has("--rpm")) {
  inspectArtifact("rpm", ".rpm");
}

if (args.has("--deb")) {
  inspectArtifact("deb", ".deb");
}

if (failures.length > 0) {
  console.error("Linux packaging validation failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("Linux packaging metadata validated.");
