// Spritesheet formats the import supports, through the app's own import,
// spritesheet editor, and save code, in Chromium and WebKit. Each case draws
// its sheet and JSON in the page, so no app server, user projects, or
// third-party art is needed. See docs/spritesheets.md.
//
//   bun run test:spritesheet-formats
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const source = process.cwd();
const fixtureEntry = `
import {
  SPRITESHEET_FORMAT_CASES,
  runSpritesheetFormatCase,
} from "${source}/tests/support/spritesheetFormatsHarness.js";
window.spritesheetFormatCases = SPRITESHEET_FORMAT_CASES;
window.runSpritesheetFormatCase = runSpritesheetFormatCase;
`;

const runInBrowser = async ({ browserType, fixture }) => {
  const browser = await browserType.launch({ headless: true });
  const failures = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("https://fixture.test/**", (route) =>
      route.fulfill(
        new URL(route.request().url()).pathname === "/fixture.js"
          ? { contentType: "text/javascript", body: fixture }
          : {
              contentType: "text/html",
              body: '<script type="module" src="/fixture.js"></script>',
            },
      ),
    );
    await page.goto("https://fixture.test/");
    await page.waitForFunction(() => window.runSpritesheetFormatCase);

    const caseNames = await page.evaluate(() => window.spritesheetFormatCases);
    for (const caseName of caseNames) {
      let result;
      try {
        result = await page.evaluate(
          (name) => window.runSpritesheetFormatCase(name),
          caseName,
        );
      } catch (error) {
        result = { problems: [error.message] };
      }
      const label = `${browserType.name()}: ${caseName}`;
      if (result.problems.length > 0) {
        failures.push(`${label}\n    ${result.problems.join("\n    ")}`);
        console.log(`FAIL ${label}`);
        continue;
      }
      const clips = Object.entries(result.animations)
        .map(([clipName, frameCount]) => `${clipName} (${frameCount})`)
        .join(", ");
      console.log(`ok   ${label}: ${clips}`);
    }
    assert.deepEqual(pageErrors, [], `${browserType.name()} page errors`);
  } finally {
    await browser.close();
  }
  return failures;
};

const directory = await mkdtemp(join(tmpdir(), "rvn-spritesheet-formats-"));
try {
  const entry = join(directory, "entry.js");
  const bundle = join(directory, "fixture.js");
  await writeFile(entry, fixtureEntry);
  execFileSync("bun", [
    "build",
    entry,
    "--target",
    "browser",
    "--outfile",
    bundle,
  ]);
  const fixture = await readFile(bundle, "utf8");

  const failures = [];
  for (const browserType of [chromium, webkit]) {
    failures.push(...(await runInBrowser({ browserType, fixture })));
  }
  assert.deepEqual(
    failures,
    [],
    `spritesheet formats failed:\n${failures.join("\n")}`,
  );
  console.log("Spritesheet formats: PASS");
} finally {
  await rm(directory, { recursive: true, force: true });
}
