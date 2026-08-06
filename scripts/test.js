import { spawn } from "node:child_process";

// Hand-rolled node suites: domain/runtime/collab/integration coverage.
const nodeScripts = [
  "scripts/test-route-engine-project-data.js",
  "scripts/test-collab-adapters.js",
  "scripts/test-integration.js",
  "scripts/test-convergence.js",
  "scripts/test-smoke.js",
  "scripts/test-export-bundle-pipeline.js",
];

const run = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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
          `Test command failed: ${command} ${args.join(" ")} (${signal || `exit ${code}`})`,
        ),
      );
    });
  });

for (const scriptPath of nodeScripts) {
  console.log(`Running ${scriptPath}`);
  await run(process.execPath, [scriptPath]);
}

// The vitest suite (tests/**) is the bulk of the coverage: component stores,
// handlers, rendered views, and the Puty sqlite storage scenarios.
console.log("Running vitest (tests/**)");
await run("bunx", ["vitest", "run"]);

console.log("All tests: PASS");
