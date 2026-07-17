#!/usr/bin/env node

import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const appDirArgument = process.argv[2];

if (!appDirArgument) {
  console.error(
    "Usage: node scripts/validate-linux-appimage-ime.js <path-to-AppDir>",
  );
  process.exit(1);
}

const appDir = path.resolve(appDirArgument);
const gtkHookPath = path.join(
  appDir,
  "apprun-hooks",
  "linuxdeploy-plugin-gtk.sh",
);
const requirements = [
  {
    cacheId: "fcitx",
    displayName: "Fcitx5",
    moduleName: "im-fcitx5.so",
    runtimeLibraryPrefix: "libFcitx5GClient.so",
  },
  {
    cacheId: "ibus",
    displayName: "IBus",
    moduleName: "im-ibus.so",
    runtimeLibraryPrefix: "libibus-1.0.so",
  },
];

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function collectPaths(rootPath) {
  if (!fs.existsSync(rootPath)) {
    return [];
  }

  const paths = [];
  const entries = fs.readdirSync(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);

    paths.push(entryPath);
    if (entry.isDirectory()) {
      paths.push(...collectPaths(entryPath));
    }
  }

  return paths;
}

function findByBaseName(paths, fileName) {
  return paths.find((filePath) => path.basename(filePath) === fileName);
}

if (!fs.existsSync(appDir)) {
  fail(`AppDir does not exist: ${appDir}`);
}

if (!fs.existsSync(gtkHookPath)) {
  fail(`linuxdeploy GTK runtime hook is missing: ${gtkHookPath}`);
}

const gtkHook = fs.readFileSync(gtkHookPath, "utf8");
const moduleCacheMatch = gtkHook.match(
  /GTK_IM_MODULE_FILE=["']?\$APPDIR\/+([^"'\s]+)["']?/,
);

if (!moduleCacheMatch) {
  fail("linuxdeploy GTK runtime hook does not set GTK_IM_MODULE_FILE");
}

const moduleCachePath = path.join(appDir, moduleCacheMatch[1]);

if (!fs.existsSync(moduleCachePath)) {
  fail(`GTK input-method cache is missing: ${moduleCachePath}`);
}

const appDirLibraryRoots = [
  path.join(appDir, "usr", "lib"),
  path.join(appDir, "usr", "lib64"),
];
const appDirPaths = appDirLibraryRoots.flatMap((libraryRoot) =>
  collectPaths(libraryRoot),
);
const moduleCache = fs.readFileSync(moduleCachePath, "utf8");
const libraryDirectories = appDirPaths.filter((entryPath) => {
  try {
    return fs.statSync(entryPath).isDirectory();
  } catch {
    return false;
  }
});

libraryDirectories.unshift(...appDirLibraryRoots);

for (const requirement of requirements) {
  const modulePath = findByBaseName(appDirPaths, requirement.moduleName);

  if (!modulePath) {
    fail(`${requirement.displayName} GTK3 module is missing`);
  }

  if (!moduleCache.includes(`"${requirement.moduleName}"`)) {
    fail(
      `${requirement.displayName} GTK3 module is not registered in ${moduleCachePath}`,
    );
  }

  if (!moduleCache.includes(`"${requirement.cacheId}"`)) {
    fail(
      `${requirement.displayName} input-method id is not registered in ${moduleCachePath}`,
    );
  }

  const runtimeLibrary = appDirPaths.find((entryPath) =>
    path.basename(entryPath).startsWith(requirement.runtimeLibraryPrefix),
  );

  if (!runtimeLibrary) {
    fail(`${requirement.displayName} runtime client library is missing`);
  }

  let dependencyReport;

  try {
    dependencyReport = childProcess.execFileSync("ldd", [modulePath], {
      encoding: "utf8",
      env: {
        ...process.env,
        LD_LIBRARY_PATH: libraryDirectories.join(":"),
      },
      stderr: "pipe",
    });
  } catch (error) {
    fail(
      `could not inspect ${requirement.displayName} GTK3 module dependencies: ${error.message}`,
    );
  }

  if (dependencyReport.includes("not found")) {
    fail(
      `${requirement.displayName} GTK3 module has missing dependencies:\n${dependencyReport}`,
    );
  }
}

console.log("AppImage GTK input-method modules validated: Fcitx5, IBus.");
