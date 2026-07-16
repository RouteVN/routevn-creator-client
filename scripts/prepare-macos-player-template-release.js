import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourceArchivePath = path.join(
  rootDir,
  "src-tauri/assets/player-templates/macos/RouteVNPlayerTemplate.app.zip",
);
const releaseArchivePath = path.join(
  rootDir,
  ".artifacts/macos-player-template/RouteVNPlayerTemplate.app.zip",
);
const templateAppName = "RouteVNPlayerTemplate.app";
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY?.trim();
const signingTeamId = process.env.APPLE_TEAM_ID?.trim();

const run = (command, commandArgs, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: rootDir,
      env: process.env,
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

const readMainExecutablePath = async (applicationPath) => {
  const infoPath = path.join(applicationPath, "Contents/Info.plist");
  const result = await run(
    "/usr/bin/plutil",
    ["-extract", "CFBundleExecutable", "raw", "-o", "-", infoPath],
    { capture: true },
  );
  return path.join(applicationPath, "Contents/MacOS", result.stdout.trim());
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

  const executablePath = await readMainExecutablePath(applicationPath);
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
  const applicationPath = path.join(directory, entries[0].name);
  if (path.basename(applicationPath) !== templateAppName) {
    throw new Error(`Template archive root must be ${templateAppName}.`);
  }
  return applicationPath;
};

const isCodeBundle = (entryPath) =>
  new Set([".app", ".appex", ".bundle", ".framework", ".plugin", ".xpc"]).has(
    path.extname(entryPath),
  );

const signCode = (codePath) =>
  run("/usr/bin/codesign", [
    "--force",
    "--options",
    "runtime",
    "--timestamp",
    "--sign",
    signingIdentity,
    codePath,
  ]);

const signApplicationInsideOut = async (applicationPath) => {
  const mainExecutablePath = await readMainExecutablePath(applicationPath);
  const machoFiles = [];
  const nestedBundles = [];
  await walk(applicationPath, async (entryPath, entry) => {
    if (
      entry.isFile() &&
      entryPath !== mainExecutablePath &&
      (await isMachoFile(entryPath))
    ) {
      machoFiles.push(entryPath);
    }
    if (
      entry.isDirectory() &&
      entryPath !== applicationPath &&
      isCodeBundle(entryPath)
    ) {
      nestedBundles.push(entryPath);
    }
  });

  const deepestFirst = (left, right) =>
    right.split(path.sep).length - left.split(path.sep).length;
  machoFiles.sort(deepestFirst);
  nestedBundles.sort(deepestFirst);
  for (const machoFile of machoFiles) {
    await signCode(machoFile);
  }
  for (const nestedBundle of nestedBundles) {
    await signCode(nestedBundle);
  }
  await signCode(applicationPath);
};

const verifyDistributionSignature = async (applicationPath) => {
  await run("/usr/bin/codesign", [
    "--verify",
    "--all-architectures",
    "--deep",
    "--strict",
    "--verbose=4",
    applicationPath,
  ]);

  const mainExecutablePath = await readMainExecutablePath(applicationPath);
  for (const architecture of ["x86_64", "arm64"]) {
    const result = await run(
      "/usr/bin/codesign",
      ["-dvvv", "--arch", architecture, mainExecutablePath],
      { capture: true },
    );
    const details = `${result.stdout}\n${result.stderr}`;
    if (!details.includes("Authority=Developer ID Application:")) {
      throw new Error(
        `The ${architecture} player template slice is not signed with a Developer ID Application certificate.`,
      );
    }
    if (!details.includes("Timestamp=")) {
      throw new Error(
        `The ${architecture} player template slice has no secure timestamp.`,
      );
    }
    if (!/flags=.*\([^\n]*\bruntime\b[^\n]*\)/u.test(details)) {
      throw new Error(
        `The ${architecture} player template slice does not enable the hardened runtime.`,
      );
    }
    if (signingTeamId && !details.includes(`TeamIdentifier=${signingTeamId}`)) {
      throw new Error(
        `The ${architecture} player template slice is not signed by team ${signingTeamId}.`,
      );
    }
  }
};

if (process.platform !== "darwin") {
  throw new Error("The macOS release player template must be signed on macOS.");
}
if (!signingIdentity) {
  throw new Error(
    "APPLE_SIGNING_IDENTITY is required to prepare the macOS release player template.",
  );
}

const tempDirectory = await mkdtemp(
  path.join(os.tmpdir(), "routevn-macos-release-template-"),
);
try {
  const sourceDirectory = path.join(tempDirectory, "source");
  await mkdir(sourceDirectory);
  await run("/usr/bin/ditto", [
    "-x",
    "-k",
    "--noqtn",
    sourceArchivePath,
    sourceDirectory,
  ]);
  const sourceApplication = await requireSingleApplication(sourceDirectory);
  await validateUniversalApplication(sourceApplication);
  await signApplicationInsideOut(sourceApplication);
  await verifyDistributionSignature(sourceApplication);

  await mkdir(path.dirname(releaseArchivePath), { recursive: true });
  const partPath = `${releaseArchivePath}.part`;
  await rm(partPath, { force: true });
  await run("/usr/bin/ditto", [
    "-c",
    "-k",
    "--keepParent",
    "--norsrc",
    "--noextattr",
    "--noqtn",
    "--noacl",
    sourceApplication,
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
  await validateUniversalApplication(verifiedApplication);
  await verifyDistributionSignature(verifiedApplication);
  await rename(partPath, releaseArchivePath);
} finally {
  await rm(tempDirectory, { recursive: true, force: true });
}

console.log(`Signed macOS release player template: ${releaseArchivePath}`);
