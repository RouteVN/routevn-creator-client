import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const playerIndexPath = path.join(
  rootDir,
  "scripts/player-templates/windows/index.html",
);
const shellDir = path.join(rootDir, "crates/routevn-packager/tauri-shell");
const shellDistDir = path.join(shellDir, "dist");
const creatorTemplateDir = path.join(
  rootDir,
  "src-tauri/assets/player-templates/windows",
);
const templateOutputPath = path.join(
  creatorTemplateDir,
  "RouteVNPlayerTemplate.exe",
);
const windowsTarget = "x86_64-pc-windows-msvc";

const args = new Set(process.argv.slice(2));
const prepareOnly = args.has("--prepare-only");

const run = (command, commandArgs, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: options.cwd ?? rootDir,
      env: {
        ...process.env,
        ...options.env,
      },
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${commandArgs.join(" ")} failed with exit code ${code}`,
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

const commandExists = (command) =>
  new Promise((resolve) => {
    const child = spawn(
      process.platform === "win32" ? "where" : "which",
      [command],
      {
        shell: process.platform === "win32",
        stdio: "ignore",
      },
    );

    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });

const ensureBuildTooling = async () => {
  const missing = [];

  if (!(await commandExists("cargo-xwin"))) {
    missing.push("cargo-xwin");
  }

  if (!(await commandExists("llvm-rc"))) {
    missing.push("llvm-rc");
  }

  if (!(await commandExists("clang-cl"))) {
    missing.push("clang-cl");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing Windows template build tool(s): ${missing.join(
        ", ",
      )}. Install the Rust target with \`rustup target add ${windowsTarget}\`, install cargo-xwin with \`cargo install cargo-xwin --version 0.19.2 --locked\`, and install LLVM/Clang so \`llvm-rc\` and \`clang-cl\` are on PATH.`,
    );
  }
};

const stagePlayerFrontend = async () => {
  const bundleMainJsPath = path.join(rootDir, "static/bundle/main.js");
  const persistenceHostPath = path.join(
    rootDir,
    "static/bundle/player-runtime-persistence-host.js",
  );
  const windowChromePath = path.join(rootDir, "static/public/windowChrome.js");

  if (
    !(await pathExists(playerIndexPath)) ||
    !(await pathExists(bundleMainJsPath)) ||
    !(await pathExists(persistenceHostPath)) ||
    !(await pathExists(windowChromePath))
  ) {
    throw new Error(
      "The player frontend bundles are missing. Run `bun run build:bundle` first.",
    );
  }

  await mkdir(shellDistDir, { recursive: true });
  await copyFile(playerIndexPath, path.join(shellDistDir, "index.html"));
  await copyFile(bundleMainJsPath, path.join(shellDistDir, "main.js"));
  await copyFile(
    persistenceHostPath,
    path.join(shellDistDir, "player-runtime-persistence-host.js"),
  );
  await copyFile(windowChromePath, path.join(shellDistDir, "windowChrome.js"));
};

const resolveBuiltTemplateExe = async () => {
  const targetRoots = [path.join(shellDir, "src-tauri/target")];
  const envCargoTargetDir = process.env.CARGO_TARGET_DIR?.trim();

  if (envCargoTargetDir) {
    if (path.isAbsolute(envCargoTargetDir)) {
      targetRoots.unshift(envCargoTargetDir);
    } else {
      targetRoots.unshift(path.resolve(shellDir, envCargoTargetDir));
      targetRoots.unshift(
        path.resolve(shellDir, "src-tauri", envCargoTargetDir),
      );
    }
  }

  const candidates = [];
  const targetExeNames = ["routevn-shell.exe", "RouteVN Shell.exe"];

  const uniqueTargetRoots = new Set(targetRoots);

  for (const targetRoot of uniqueTargetRoots) {
    for (const exeName of targetExeNames) {
      candidates.push(path.join(targetRoot, windowsTarget, "release", exeName));
    }

    candidates.push(path.join(targetRoot, "release/routevn-shell.exe"));
  }

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    `Windows player template build succeeded, but no expected .exe artifact was found under: ${[
      ...uniqueTargetRoots,
    ].join(", ")}.`,
  );
};

await stagePlayerFrontend();

if (prepareOnly) {
  console.log("Prepared RouteVN player template frontend.");
  process.exit(0);
}

await ensureBuildTooling();

await run(
  "tauri",
  ["build", "--runner", "cargo-xwin", "--target", windowsTarget, "--no-bundle"],
  {
    cwd: shellDir,
  },
);

const builtTemplateExe = await resolveBuiltTemplateExe();
await mkdir(creatorTemplateDir, { recursive: true });
await copyFile(builtTemplateExe, templateOutputPath);

console.log(`Windows player template: ${templateOutputPath}`);
