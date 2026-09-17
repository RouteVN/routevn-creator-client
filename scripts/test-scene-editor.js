import { spawnSync } from "node:child_process";

const checks = [
  [
    "bunx",
    [
      "vitest",
      "run",
      "tests/sceneEditor",
      "tests/layoutEditor/lexicalLayoutTextEditor.test.js",
      "--exclude",
      "**/.artifacts/**",
    ],
  ],
  [process.execPath, ["tests/sceneEditor/lexicalMultilineEditing.browser.mjs"]],
  [process.execPath, ["tests/sceneEditor/lexicalEditingContracts.browser.mjs"]],
  [process.execPath, ["tests/sceneEditor/lexicalShortcutFocus.browser.mjs"]],
  [process.execPath, ["tests/sceneEditor/lexicalTouchReturn.browser.mjs"]],
  [process.execPath, ["tests/sceneEditor/lexicalTouchSelection.browser.mjs"]],
  [process.execPath, ["tests/sceneEditor/lexicalCaretRecovery.browser.mjs"]],
  [process.execPath, ["tests/sceneEditor/lexicalImeConfirmation.browser.mjs"]],
  [process.execPath, ["tests/sceneEditor/lexicalEmptyLineBackspace.browser.mjs"]],
];
for (const [command, args] of checks) {
  console.log(`Running ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log("Scene text editor regression checks: PASS");
