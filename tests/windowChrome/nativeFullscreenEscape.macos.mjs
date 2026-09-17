// Runs an isolated AppKit/WKWebView window; does not open user projects.
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin")
  throw new Error("This native fullscreen check requires macOS.");
const directory = await mkdtemp(join(tmpdir(), "rvn-native-fullscreen-"));
try {
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "guard.js");
  const contents = join(directory, "Fullscreen Regression.app", "Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await writeFile(
    join(contents, "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
    <plist version="1.0"><dict>
    <key>CFBundleExecutable</key><string>fullscreen-test</string>
    <key>CFBundleIdentifier</key><string>com.routevn.fullscreen-regression</string>
    <key>CFBundleName</key><string>Fullscreen Regression</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>NSHighResolutionCapable</key><true/>
    </dict></plist>`,
  );
  const executable = join(contents, "MacOS", "fullscreen-test");
  const client = fileURLToPath(
    new URL(
      "../../src/deps/clients/tauri/fullscreenEscape.js",
      import.meta.url,
    ),
  );
  await writeFile(
    entry,
    `import {createFullscreenEscapeClient} from ${JSON.stringify(client)}; globalThis.FullscreenEscape={createFullscreenEscapeClient};`,
  );
  execFileSync(
    "bun",
    [
      "build",
      entry,
      "--target",
      "browser",
      "--format",
      "iife",
      "--outfile",
      bundle,
    ],
    { stdio: "inherit" },
  );
  const nativeGuard = join(directory, "native-guard.o");
  execFileSync(
    "xcrun",
    [
      "clang",
      "-fobjc-arc",
      "-c",
      fileURLToPath(
        new URL(
          "../../src-tauri/src/macos_fullscreen_escape.m",
          import.meta.url,
        ),
      ),
      "-o",
      nativeGuard,
    ],
    { stdio: "inherit" },
  );
  execFileSync(
    "xcrun",
    [
      "swiftc",
      "-module-cache-path",
      join(directory, "modules"),
      fileURLToPath(
        new URL("nativeFullscreenEscape.macos.swift", import.meta.url),
      ),
      nativeGuard,
      "-o",
      executable,
    ],
    { stdio: "inherit" },
  );
  for (const scenario of process.argv[2]
    ? [process.argv[2]]
    : ["web-focus", "window-focus"]) {
    console.log(`Native fullscreen scenario: ${scenario}`);
    execFileSync(executable, [bundle, scenario], {
      stdio: "inherit",
      timeout: 30000,
    });
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
