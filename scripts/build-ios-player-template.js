import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectDir = path.join(rootDir, "ios/player");
const webDir = path.join(projectDir, "RouteVNPlayer/web");
const bundleDir = path.join(rootDir, "static/bundle");
const rustCrate = path.join(rootDir, "crates/routevn-player-ffi/Cargo.toml");
const rustTargetDir = path.join(rootDir, ".artifacts/ios-player-rust");
const derivedDataDir = path.join(rootDir, ".artifacts/ios-player-build");
const templateDir = path.join(rootDir, "src-tauri/assets/player-templates/ios");
const templateAppName = "RouteVNPlayerTemplate.app";
const deploymentTarget = "16.0";
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--prepare-only")) {
  throw new Error(
    "Usage: node scripts/build-ios-player-template.js [--prepare-only]",
  );
}
if (process.platform !== "darwin") {
  throw new Error("The iOS player template builds only on macOS with Xcode.");
}

const run = (command, commandArgs, { cwd = rootDir, env, capture } = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd,
      env: { ...process.env, ...env },
      stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let stdout = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed (${signal ?? code})`));
    });
  });

const files = [
  [path.join(bundleDir, "main.js"), "main.js"],
  [
    path.join(bundleDir, "player-runtime-persistence-host-ios.js"),
    "player-runtime-persistence-host.js",
  ],
  [path.join(rootDir, "scripts/player-templates/ios/index.html"), "index.html"],
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
console.log(`Prepared iOS player frontend: ${webDir}`);

if (!args.includes("--prepare-only")) {
  // The template is committed, so source paths in panic messages must not
  // name this machine's folders.
  const cargoHome = process.env.CARGO_HOME ?? path.join(os.homedir(), ".cargo");
  const rustflags = [
    `--remap-path-prefix=${rootDir}=/routevn`,
    `--remap-path-prefix=${cargoHome}=/cargo`,
  ].join("\x1f");
  // The device library is all the template needs; the simulator library lets
  // the Xcode project run in the simulator during development.
  for (const target of ["aarch64-apple-ios", "aarch64-apple-ios-sim"]) {
    await run(
      "cargo",
      [
        "build",
        "--release",
        "--locked",
        "--manifest-path",
        rustCrate,
        "--target",
        target,
        "--target-dir",
        rustTargetDir,
      ],
      {
        env: {
          IPHONEOS_DEPLOYMENT_TARGET: deploymentTarget,
          CARGO_ENCODED_RUSTFLAGS: rustflags,
        },
      },
    );
  }
  await rm(derivedDataDir, { recursive: true, force: true });
  await run(
    "xcodebuild",
    [
      "-project",
      "RouteVNPlayer.xcodeproj",
      "-scheme",
      "RouteVNPlayer",
      "-configuration",
      "Release",
      "-sdk",
      "iphoneos",
      "-destination",
      "generic/platform=iOS",
      "-derivedDataPath",
      derivedDataDir,
      "-quiet",
      "CODE_SIGNING_ALLOWED=NO",
      "build",
    ],
    { cwd: projectDir },
  );
  const builtApp = path.join(
    derivedDataDir,
    "Build/Products/Release-iphoneos/RouteVNPlayer.app",
  );
  const temporaryDir = await mkdtemp(
    path.join(os.tmpdir(), "routevn-ios-template-"),
  );
  try {
    const stagedApp = path.join(temporaryDir, templateAppName);
    await run("/usr/bin/ditto", [builtApp, stagedApp]);
    const entries = await readdir(stagedApp);
    for (const required of ["RouteVNPlayer", "Info.plist", "Assets.car"]) {
      if (!entries.includes(required)) {
        throw new Error(`The built iOS player has no ${required}.`);
      }
    }
    if (entries.includes("_CodeSignature")) {
      throw new Error("The iOS player template must not be signed.");
    }
    // Drops the debug map, which names this machine's build folders, and
    // local symbols, as an archive build would.
    await run("xcrun", [
      "strip",
      "-S",
      "-x",
      path.join(stagedApp, "RouteVNPlayer"),
    ]);
    const architectures = await run(
      "/usr/bin/lipo",
      ["-archs", path.join(stagedApp, "RouteVNPlayer")],
      { capture: true },
    );
    if (architectures.trim() !== "arm64") {
      throw new Error(
        `The iOS player must be arm64 only, not ${architectures.trim()}.`,
      );
    }
    const executable = await readFile(path.join(stagedApp, "RouteVNPlayer"));
    for (const localPath of [rootDir, os.homedir()]) {
      if (executable.includes(localPath)) {
        throw new Error(`The iOS player executable contains ${localPath}.`);
      }
    }
    await mkdir(templateDir, { recursive: true });
    const archive = path.join(templateDir, `${templateAppName}.zip`);
    await rm(archive, { force: true });
    await run("/usr/bin/ditto", [
      "-c",
      "-k",
      "--keepParent",
      "--norsrc",
      "--noextattr",
      "--noqtn",
      "--noacl",
      stagedApp,
      archive,
    ]);
    console.log(`iOS player template: ${archive}`);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}
