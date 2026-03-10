import { spawn } from "node:child_process";

const scripts = [
  "scripts/test-command-only.js",
  "scripts/test-collab-adapters.js",
  "scripts/test-integration.js",
  "scripts/test-convergence.js",
  "scripts/test-smoke.js",
];

const runScript = (scriptPath) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Test script failed: ${scriptPath} (${signal || `exit ${code}`})`,
        ),
      );
    });
  });

for (const scriptPath of scripts) {
  console.log(`Running ${scriptPath}`);
  await runScript(scriptPath);
}

console.log("All tests: PASS");
