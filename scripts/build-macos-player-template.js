import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { NATIVE_PLAYER_INDEX_HTML } from "../src/deps/services/shared/projectExportService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const shellDir = path.join(rootDir, "crates/routevn-packager/tauri-shell");
const shellDistDir = path.join(shellDir, "dist");
const templateDir = path.join(
  rootDir,
  "src-tauri/assets/player-templates/macos",
);
const templateOutputPath = path.join(
  templateDir,
  "RouteVNPlayerTemplate.app.zip",
);
const universalTarget = "universal-apple-darwin";
const templateAppName = "RouteVNPlayerTemplate.app";
const args = new Set(process.argv.slice(2));
const prepareOnly = args.has("--prepare-only");

const run = (command, commandArgs, options = {}) =>
  new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ...options.env,
    };
    for (const key of options.unsetEnv ?? []) {
      delete env[key];
    }
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? rootDir,
      env,
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} ${commandArgs.join(" ")} failed with exit code ${code}${
            stderr.trim() ? `: ${stderr.trim()}` : ""
          }`,
        ),
      );
    });
  });

const pathExists = async (value) => {
  try {
    await stat(value);
    return true;
  } catch {
    return false;
  }
};

const stagePlayerFrontend = async () => {
  const bundleMainJsPath = path.join(rootDir, "static/bundle/main.js");
  const persistenceHostPath = path.join(
    rootDir,
    "static/bundle/player-runtime-persistence-host.js",
  );
  if (
    !(await pathExists(bundleMainJsPath)) ||
    !(await pathExists(persistenceHostPath))
  ) {
    throw new Error(
      "The player frontend bundles are missing. Run `bun run build:bundle` first.",
    );
  }

  await mkdir(shellDistDir, { recursive: true });
  await writeFile(
    path.join(shellDistDir, "index.html"),
    NATIVE_PLAYER_INDEX_HTML,
  );
  await copyFile(bundleMainJsPath, path.join(shellDistDir, "main.js"));
  await copyFile(
    persistenceHostPath,
    path.join(shellDistDir, "player-runtime-persistence-host.js"),
  );
  await rm(path.join(shellDistDir, "windowChrome.js"), { force: true });
};

const resolveBuiltApplication = async () => {
  const targetRoots = [path.join(shellDir, "src-tauri/target")];
  const cargoTargetDir = process.env.CARGO_TARGET_DIR?.trim();
  if (cargoTargetDir) {
    targetRoots.unshift(
      path.isAbsolute(cargoTargetDir)
        ? cargoTargetDir
        : path.resolve(shellDir, "src-tauri", cargoTargetDir),
    );
  }

  const candidates = targetRoots.map((targetRoot) =>
    path.join(
      targetRoot,
      universalTarget,
      "release/bundle/macos/RouteVN Shell.app",
    ),
  );
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `The macOS player template build succeeded, but no application was found under: ${targetRoots.join(", ")}.`,
  );
};

const isMachoFile = async (filePath) => {
  const bytes = await readFile(filePath);
  if (bytes.byteLength < 4) {
    return false;
  }
  const magic = bytes.subarray(0, 4).toString("hex");
  return new Set([
    "feedface",
    "cefaedfe",
    "feedfacf",
    "cffaedfe",
    "cafebabe",
    "bebafeca",
    "cafebabf",
    "bfbafeca",
  ]).has(magic);
};

const walk = async (directory, visit) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    await visit(entryPath, entry);
    if (entry.isDirectory()) {
      await walk(entryPath, visit);
    }
  }
};

const validateSymlinks = async (applicationPath) => {
  const applicationRealPath = await realpath(applicationPath);
  await walk(applicationPath, async (entryPath, entry) => {
    if (!entry.isSymbolicLink()) {
      return;
    }
    const resolved = await realpath(entryPath);
    if (
      resolved !== applicationRealPath &&
      !resolved.startsWith(`${applicationRealPath}${path.sep}`)
    ) {
      throw new Error(`Template symlink escapes the app bundle: ${entryPath}`);
    }
  });
};

const validateUniversalApplication = async (applicationPath) => {
  await validateSymlinks(applicationPath);
  const machoFiles = [];
  await walk(applicationPath, async (entryPath, entry) => {
    if (entry.isFile() && (await isMachoFile(entryPath))) {
      machoFiles.push(entryPath);
    }
  });
  if (machoFiles.length === 0) {
    throw new Error("The macOS player template contains no Mach-O files.");
  }
  for (const machoFile of machoFiles) {
    const result = await run("/usr/bin/lipo", ["-archs", machoFile], {
      capture: true,
    });
    const architectures = new Set(result.stdout.trim().split(/\s+/u));
    if (!architectures.has("arm64") || !architectures.has("x86_64")) {
      throw new Error(`Mach-O is not universal: ${machoFile}`);
    }
  }

  const infoPath = path.join(applicationPath, "Contents/Info.plist");
  const result = await run(
    "/usr/bin/plutil",
    ["-extract", "CFBundleExecutable", "raw", "-o", "-", infoPath],
    { capture: true },
  );
  const executablePath = path.join(
    applicationPath,
    "Contents/MacOS",
    result.stdout.trim(),
  );
  const executableMode = (await lstat(executablePath)).mode;
  if ((executableMode & 0o111) === 0) {
    throw new Error("The macOS player template executable bit is missing.");
  }
};

const requireSingleApplication = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    !entries[0].isDirectory() ||
    path.extname(entries[0].name) !== ".app"
  ) {
    throw new Error(
      "The macOS player template archive must contain exactly one app bundle.",
    );
  }
  return path.join(directory, entries[0].name);
};

const hashFile = async (filePath) => {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
};

if (process.platform !== "darwin" && !prepareOnly) {
  throw new Error(
    "The universal macOS player template must be built on macOS.",
  );
}

await stagePlayerFrontend();

if (prepareOnly) {
  console.log("Prepared RouteVN macOS player template frontend.");
  process.exit(0);
}

await run("tauri", ["build", "--target", universalTarget, "--bundles", "app"], {
  cwd: shellDir,
  unsetEnv: [
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
  ],
});

const builtApplication = await resolveBuiltApplication();
await validateUniversalApplication(builtApplication);

const tempDirectory = await mkdtemp(
  path.join(os.tmpdir(), "routevn-macos-player-template-"),
);
try {
  const stagedApplication = path.join(tempDirectory, templateAppName);
  await run("/usr/bin/ditto", [
    "--norsrc",
    "--noextattr",
    "--noqtn",
    "--noacl",
    builtApplication,
    stagedApplication,
  ]);
  await validateUniversalApplication(stagedApplication);

  await mkdir(templateDir, { recursive: true });
  const partPath = `${templateOutputPath}.part`;
  await rm(partPath, { force: true });
  await run("/usr/bin/ditto", [
    "-c",
    "-k",
    "--keepParent",
    "--norsrc",
    "--noextattr",
    "--noqtn",
    "--noacl",
    stagedApplication,
    partPath,
  ]);

  const verificationDirectory = path.join(tempDirectory, "verify");
  await mkdir(verificationDirectory);
  await run("/usr/bin/ditto", [
    "-x",
    "-k",
    "--noqtn",
    partPath,
    verificationDirectory,
  ]);
  const verifiedApplication = await requireSingleApplication(
    verificationDirectory,
  );
  if (path.basename(verifiedApplication) !== templateAppName) {
    throw new Error(`Template archive root must be ${templateAppName}.`);
  }
  await validateUniversalApplication(verifiedApplication);
  await rename(partPath, templateOutputPath);
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}

console.log(`macOS player template: ${templateOutputPath}`);
console.log(`SHA-256: ${await hashFile(templateOutputPath)}`);
