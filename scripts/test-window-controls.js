import { spawnSync } from "node:child_process";

const checks = [
  [
    "bunx",
    [
      "vitest",
      "run",
      "tests/windowChrome",
      "tests/tauri/fullscreenEscape.test.js",
      "tests/app/app.handlers.test.js",
      "--exclude",
      "**/.artifacts/**",
    ],
  ],
  [process.execPath, ["tests/windowChrome/escapeExit.browser.mjs"]],
  [process.execPath, ["tests/windowChrome/nativeFullscreenEscape.browser.mjs"]],
];
for (const [command, args] of checks) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Window control regression checks: PASS");
