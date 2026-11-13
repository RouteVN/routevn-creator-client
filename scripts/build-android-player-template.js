import { spawn } from "node:child_process";
import { access, copyFile, cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectDir = path.join(rootDir, "android/player");
const webDir = path.join(projectDir, "app/src/main/assets/web");
const bundleDir = path.join(rootDir, "static/bundle");
const templateDir = path.join(
  rootDir,
  "src-tauri/assets/player-templates/android",
);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--prepare-only")) {
  throw new Error(
    "Usage: node scripts/build-android-player-template.js [--prepare-only]",
  );
}

const run = (command, commandArgs, cwd = rootDir) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });

const files = [
  [path.join(bundleDir, "main.js"), "main.js"],
  [
    path.join(bundleDir, "player-runtime-persistence-host-android.js"),
    "player-runtime-persistence-host.js",
  ],
  [
    path.join(rootDir, "scripts/player-templates/android/index.html"),
    "index.html",
  ],
];
for (const [source] of files) {
  try {
    await access(source);
  } catch {
    throw new Error(
      `Missing player frontend: ${source}. Run bun run build:bundle first.`,
    );
  }
}
await rm(webDir, { recursive: true, force: true });
await mkdir(webDir, { recursive: true });
for (const [source, name] of files) {
  await copyFile(source, path.join(webDir, name));
}
try {
  await cp(path.join(bundleDir, "assets"), path.join(webDir, "assets"), {
    recursive: true,
  });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
console.log(`Prepared Android player frontend: ${webDir}`);

if (!args.includes("--prepare-only")) {
  await run("bash", ["scripts/build-android-player-rust.sh"]);
  await run(
    "./gradlew",
    [":app:assembleRelease", ":app:bundleRelease"],
    projectDir,
  );
  const apk = path.join(
    projectDir,
    "app/build/outputs/apk/release/app-release-unsigned.apk",
  );
  const aab = path.join(
    projectDir,
    "app/build/outputs/bundle/release/app-release.aab",
  );
  const temporaryDir = await mkdtemp(
    path.join(os.tmpdir(), "routevn-android-template-"),
  );
  try {
    const describe = (command, flag, template, out) =>
      run("cargo", [
        "run",
        "--release",
        "--manifest-path",
        "crates/routevn-android-export/Cargo.toml",
        "--bin",
        "routevn-android-template",
        "--",
        command,
        flag,
        template,
        "--out",
        out,
      ]);
    const descriptor = path.join(temporaryDir, "template.json");
    const bundleDescriptor = path.join(temporaryDir, "template.aab.json");
    await describe("describe", "--apk", apk, descriptor);
    await describe("describe-bundle", "--aab", aab, bundleDescriptor);
    await mkdir(templateDir, { recursive: true });
    await copyFile(apk, path.join(templateDir, "RouteVNPlayerTemplate.apk"));
    await copyFile(
      descriptor,
      path.join(templateDir, "RouteVNPlayerTemplate.json"),
    );
    await copyFile(aab, path.join(templateDir, "RouteVNPlayerTemplate.aab"));
    await copyFile(
      bundleDescriptor,
      path.join(templateDir, "RouteVNPlayerTemplate.aab.json"),
    );
    console.log(`Android player templates and descriptors: ${templateDir}`);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}
