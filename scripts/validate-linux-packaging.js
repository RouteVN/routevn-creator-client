#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

const packageName = "routevn-creator";
const displayName = "RouteVN Creator";
const legacyPackageName = packageName.replace(
  "routevn",
  ["route", "vn"].join("-"),
);
const forbiddenCopy = "Join our Discord server to stay updated.";
const expectedSocialCopy = "Follow us on social media to stay updated.";
const stalePackageDescription = [
  "create",
  "visual novels",
  "without any coding",
].join(" ");

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
  const lowerContents = contents.toLowerCase();

  expect(
    !contents.includes(legacyPackageName),
    `${relativePath} contains a legacy package spelling`,
  );
  expect(
    !contents.includes(forbiddenCopy),
    `${relativePath} contains stale Discord update copy`,
  );
  expect(
    !lowerContents.includes(stalePackageDescription),
    `${relativePath} contains stale package description copy`,
  );
}

const sourceFiles = [
  "package.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "src-tauri/tauri.prod.conf.json",
  "src-tauri/tauri.linux.conf.json",
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
const aurSrcinfo = readText("packaging/aur/.SRCINFO");
const aurPkgrel = aurPkgbuild.match(/^pkgrel=(\d+)$/m)?.[1];

expect(
  packageJson.description.startsWith(displayName) &&
    packageJson.description.includes(expectedSocialCopy),
  "package.json description must use social media update copy",
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
  tauriConfig.bundle.longDescription.startsWith(displayName) &&
    tauriConfig.bundle.longDescription.includes(expectedSocialCopy),
  "Tauri longDescription must use social media update copy",
);
expect(
  tauriConfig.bundle.shortDescription === displayName,
  `Tauri shortDescription must be ${displayName}`,
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
  metainfo.includes(`<summary>${displayName}</summary>`),
  "AppStream summary must use RouteVN Creator",
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
  metainfo.includes(`<p>${displayName}. ${expectedSocialCopy}</p>`),
  "AppStream description must use social media update copy",
);
expect(
  metainfo.includes(`<release version="${tauriConfig.version}"`),
  `AppStream release version must be ${tauriConfig.version}`,
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
  aurPkgbuild.includes(`pkgdesc="${displayName}"`),
  "AUR pkgdesc must use RouteVN Creator",
);
expect(Boolean(aurPkgrel), "AUR pkgrel must be set");
expect(
  aurSrcinfo.includes(`\tpkgrel = ${aurPkgrel}`),
  "AUR .SRCINFO pkgrel must match PKGBUILD",
);
expect(
  aurSrcinfo.includes(`\tpkgdesc = ${displayName}`),
  "AUR .SRCINFO pkgdesc must use RouteVN Creator",
);
expect(
  aurPkgbuild.includes("Comment=RouteVN Creator"),
  "AUR desktop comment must use RouteVN Creator",
);
expect(
  aurPkgbuild.includes("/usr/share/applications/routevn-creator.desktop"),
  "AUR desktop file must be routevn-creator.desktop",
);

if (failures.length > 0) {
  console.error("Linux packaging validation failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("Linux packaging metadata validated.");
