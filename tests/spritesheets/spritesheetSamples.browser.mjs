// Spritesheets exported by real sprite tools, through the app's own import,
// spritesheet editor, and save code, in Chromium and WebKit. The files are
// public examples from the Phaser and PixiJS example repositories, at pinned
// commits. They are downloaded into a temporary folder on first run and never
// committed. See docs/spritesheets.md.
//
//   bun run test:spritesheet-samples
//
// Set SPRITESHEET_SAMPLES_DIR to use a folder that already holds the files.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, webkit } from "playwright";

const PHASER =
  "https://raw.githubusercontent.com/phaserjs/examples/eb87db8355861ae222d0c5cd13aae54c2d7d72ae/public/assets";
const PIXI =
  "https://raw.githubusercontent.com/pixijs/examples/3770ac36593989be974cf981a13568a42e407103/examples/assets/spritesheet";

// Each sample's files, how many frames and animations its import should
// make, and some of those animations with their frame counts.
const SAMPLES = [
  {
    name: "PixiJS JSON Hash (fighter)",
    base: PIXI,
    pngs: ["fighter.png"],
    json: "fighter.json",
    frames: 30,
    animationCount: 1,
    animations: { rollSequence: 30 },
  },
  {
    name: "PixiJS JSON Hash (mc)",
    base: PIXI,
    pngs: ["mc.png"],
    json: "mc.json",
    frames: 27,
    animationCount: 1,
    animations: { Explosion_Sequence_A: 27 },
  },
  {
    name: "Phaser 3, one image (knight)",
    base: `${PHASER}/animations`,
    pngs: ["knight.png"],
    json: "knight.json",
    frames: 92,
    animationCount: 13,
    animations: { attack_A: 14, attack_B: 13, idle: 6, run: 8 },
  },
  {
    name: "TexturePacker Hash, animations of different sizes (seacreatures)",
    base: `${PHASER}/animations`,
    pngs: ["seacreatures_json.png"],
    json: "seacreatures_json.json",
    frames: 198,
    animationCount: 13,
    animations: {
      blueJellyfish: 33,
      crab: 27,
      flyingFish: 2,
      greenFish0000: 1,
    },
  },
  {
    name: "Aseprite Hash (paladin)",
    base: `${PHASER}/animations/aseprite`,
    pngs: ["paladin.png"],
    json: "paladin.json",
    frames: 270,
    animationCount: 27,
    animations: { step: 10, "idle defesa": 13, Sit: 30, Ress: 8 },
  },
  {
    name: "Aseprite Array (paladin-array)",
    base: `${PHASER}/animations/aseprite`,
    pngs: ["paladin-array.png"],
    json: "paladin-array.json",
    frames: 270,
    animationCount: 27,
    animations: { step: 10, "idle defesa": 13, Sit: 30, Ress: 8 },
  },
  {
    name: "Aseprite Hash (tank)",
    base: `${PHASER}/animations/aseprite`,
    pngs: ["tank.png"],
    json: "tank.json",
    frames: 9,
    animationCount: 2,
    animations: { Move: 4, Reverse: 8 },
  },
  {
    name: "TexturePacker Array (girl)",
    base: `${PHASER}/atlas`,
    pngs: ["girl.png"],
    json: "girl.json",
    frames: 12,
    animationCount: 1,
    animations: { default: 12 },
  },
  {
    name: "Rotated frames (rotated-atlas)",
    base: `${PHASER}/atlas`,
    pngs: ["rotated-atlas.png"],
    json: "rotated-atlas.json",
    frames: 162,
    animationCount: 148,
    animations: { atari: 2, bsquadron: 3, a: 1 },
  },
  {
    name: "Phaser 3, several images (tp3-multi-atlas)",
    base: `${PHASER}/atlas`,
    pngs: [0, 1, 2, 3].map((index) => `tp3-multi-atlas-${index}.png`),
    json: "tp3-multi-atlas.json",
    frames: 186,
    animationCount: 170,
    animations: { snake: 1, tetrisblock: 3, contra: 3, phaser: 2 },
  },
];

const sampleDirectory =
  process.env.SPRITESHEET_SAMPLES_DIR ??
  join(tmpdir(), "rvn-spritesheet-samples");

const downloadSamples = async () => {
  await mkdir(sampleDirectory, { recursive: true });
  for (const sample of SAMPLES) {
    for (const fileName of [...sample.pngs, sample.json]) {
      const path = join(sampleDirectory, fileName);
      if (existsSync(path)) {
        continue;
      }
      const response = await fetch(`${sample.base}/${fileName}`);
      assert.ok(response.ok, `could not download ${fileName}`);
      await writeFile(path, Buffer.from(await response.arrayBuffer()));
    }
  }
};

const fixtureEntry = `
import { runSpritesheetSampleCheck } from "${process.cwd()}/tests/support/spritesheetFormatsHarness.js";
window.runSpritesheetSampleCheck = runSpritesheetSampleCheck;
`;

const runInBrowser = async ({ browserType, fixture }) => {
  const browser = await browserType.launch({ headless: true });
  const failures = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(120_000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.route("https://fixture.test/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/fixture.js") {
        return route.fulfill({ contentType: "text/javascript", body: fixture });
      }
      if (path.startsWith("/samples/")) {
        const fileName = path.slice("/samples/".length);
        return route.fulfill({
          contentType: fileName.endsWith(".png")
            ? "image/png"
            : "application/json",
          body: await readFile(join(sampleDirectory, fileName)),
        });
      }
      return route.fulfill({
        contentType: "text/html",
        body: '<script type="module" src="/fixture.js"></script>',
      });
    });
    await page.goto("https://fixture.test/");
    await page.waitForFunction(() => window.runSpritesheetSampleCheck);

    for (const sample of SAMPLES) {
      const toFile = (name) => ({ name, url: `/samples/${name}` });
      let result;
      try {
        result = await page.evaluate(
          (files) => window.runSpritesheetSampleCheck(files),
          { pngs: sample.pngs.map(toFile), json: toFile(sample.json) },
        );
      } catch (error) {
        result = { problems: [error.message.split("\n")[0]] };
      }
      const label = `${browserType.name()}: ${sample.name}`;
      if (result.animations) {
        const animationNames = Object.keys(result.animations);
        if (
          result.frameCount !== sample.frames ||
          animationNames.length !== sample.animationCount
        ) {
          result.problems.push(
            `imported: ${result.frameCount} frames and ${animationNames.length} animations, expected ${sample.frames} and ${sample.animationCount}`,
          );
        }
        for (const [clipName, frameCount] of Object.entries(
          sample.animations,
        )) {
          if (result.animations[clipName] !== frameCount) {
            result.problems.push(
              `imported: ${clipName} has ${result.animations[clipName] ?? "no"} frames, expected ${frameCount}`,
            );
          }
        }
      }
      if (result.problems.length > 0) {
        failures.push(`${label}\n    ${result.problems.join("\n    ")}`);
        console.log(`FAIL ${label}`);
        continue;
      }
      const clips = Object.entries(result.animations)
        .map(([clipName, frameCount]) => `${clipName} (${frameCount})`)
        .join(", ");
      console.log(
        `ok   ${label}: ${result.frameCount} frames, saved sheet ${result.sheetSize}\n       ${clips}`,
      );
    }
    assert.deepEqual(pageErrors, [], `${browserType.name()} page errors`);
  } finally {
    await browser.close();
  }
  return failures;
};

const directory = await mkdtemp(join(tmpdir(), "rvn-spritesheet-samples-"));
try {
  await downloadSamples();
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
    `spritesheet samples failed:\n${failures.join("\n")}`,
  );
  console.log("Spritesheet samples: PASS");
} finally {
  await rm(directory, { recursive: true, force: true });
}
