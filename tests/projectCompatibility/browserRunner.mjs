import { fixtureRoot as prepareFixtureRoot } from "./fixtureArchive.mjs";
import { readFixtureJson } from "./fixtureIO.mjs";
import { chromium, webkit } from "playwright";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { baselineRoot, identity, revisions } from "./baselines.mjs";
import { assertEquivalent, fileHash, decodeValue } from "./records.mjs";
import { encodeIdbValue } from "./indexedDbDump.mjs";
const artifactRoot = resolve(
  process.env.ROUTEVN_COMPATIBILITY_ARTIFACTS ?? tmpdir(),
);
mkdirSync(artifactRoot, { recursive: true });
const workspace = mkdtempSync(
  join(artifactRoot, "routevn-browser-compatibility-"),
);
const capture = process.argv.includes("--capture");
const fixtureRoot = await prepareFixtureRoot({ capture });
const filter = process.argv
  .find((arg) => arg.startsWith("--fixture="))
  ?.slice(10);
const selectedEngine = process.argv
  .find((arg) => arg.startsWith("--engine="))
  ?.slice(9);
if (selectedEngine && !["chromium", "webkit"].includes(selectedEngine))
  throw new Error("Unknown browser engine");
const report = {
  protocol: 1,
  status: "running",
  cases: [],
  fixtures: {},
  workspace,
  strictWritesTested: false,
};
const read = readFixtureJson;
const write = (path, value) => {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  writeFileSync(path, path.endsWith(".gz") ? gzipSync(bytes) : bytes);
};

function bundle(root, label) {
  const sources = [
    "src/deps/services/shared/projectRepository.js",
    "src/deps/services/shared/projectRepositoryService.js",
    "src/deps/services/shared/collab/clientStoreHistory.js",
    "src/deps/services/shared/collab/createProjectCollabService.js",
    "src/deps/services/shared/collab/partitions.js",
    "src/deps/services/web/collabClientStore.js",
    "src/deps/clients/web/webRepositoryAdapter.js",
    "node_modules/insieme/src/server.js",
    "scripts/collabTestSupport.js",
    "src/internal/project/projection.js",
    "src/internal/project/routeEngineProjectData.js",
  ];
  const entry = join(workspace, `${label}.entry.js`),
    output = join(workspace, `${label}.js`);
  writeFileSync(
    entry,
    sources
      .map(
        (source, index) =>
          `import * as module${index} from ${JSON.stringify(join(root, source))};`,
      )
      .join("\n") +
      `\nimport createRouteEngine from ${JSON.stringify(join(root, "node_modules/route-engine-js/dist/RouteEngine.js"))};\nimport { createBrowserLane } from ${JSON.stringify(resolve("tests/projectCompatibility/browserLane.mjs"))};\nwindow.compatibility = createBrowserLane(Object.assign({ createRouteEngine }, ${sources.map((_, index) => `module${index}`).join(", ")}));`,
  );
  execFileSync(
    "bun",
    ["build", entry, "--target", "browser", "--outfile", output],
    { stdio: "pipe" },
  );
  return { body: readFileSync(output, "utf8"), sha256: fileHash(output) };
}
async function pageFor(engine, artifact) {
  // Persistent profiles exercise actual on-disk IDB, including WebKit Blob storage.
  const profile = mkdtempSync(join(workspace, "browser-profile-"));
  const context = await engine.launchPersistentContext(profile, {
    headless: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://compatibility.test/**", (route) =>
    route.fulfill({
      contentType: route.request().url().endsWith(".js")
        ? "text/javascript"
        : "text/html",
      body: route.request().url().endsWith(".js")
        ? artifact.body
        : '<!doctype html><script type="module" src="/fixture.js"></script>',
    }),
  );
  await page.goto("https://compatibility.test/");
  await page.waitForFunction(() => window.compatibility);
  return { page, context, errors, profile };
}
function history(dump) {
  return dump.map((database) => ({
    name: database.name,
    version: database.version,
    stores: database.stores.filter(
      (store) => store.name !== "materialized_view_state",
    ),
  }));
}

try {
  const artifacts = {
    14: bundle(baselineRoot(14), "schema14"),
    15: bundle(baselineRoot(15), "schema15"),
    candidate: bundle(process.cwd(), "candidate"),
  };
  const previousIdentity = identity(baselineRoot(15), revisions[15]);
  report.previousReader = previousIdentity;
  report.candidate = identity(
    process.cwd(),
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  );
  report.artifacts = Object.fromEntries(
    Object.entries(artifacts).map(([name, artifact]) => [
      name,
      artifact.sha256,
    ]),
  );
  const packs = readdirSync(fixtureRoot)
    .filter(
      (id) =>
        existsSync(join(fixtureRoot, id, "manifest.json")) &&
        (!filter || id.startsWith(filter)),
    )
    .sort();
  if (!packs.length) throw new Error("No browser fixture candidates");
  for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
    if (selectedEngine && selectedEngine !== engineName) continue;
    const browser = await engine.launch({ headless: true });
    try {
      const probe = await pageFor(engine, artifacts.candidate);
      try {
        await probe.page.evaluate(() =>
          window.compatibility.verifyBrowserDump(),
        );
        report.cases.push({
          engine: engineName,
          id: "dump-round-trip",
          status: "passed",
        });
      } finally {
        await probe.context.close();
      }
      rmSync(probe.profile, { recursive: true });
      for (const id of packs) {
        const pack = join(fixtureRoot, id),
          directory = join(pack, "browser");
        const recipe = read(join(pack, "authoring-recipe.json"));
        if (recipe.platforms && !recipe.platforms.includes("browser")) {
          report.cases.push({
            id,
            engine: engineName,
            status: "not-applicable",
            reason:
              "SQLite-specific acknowledgment or checkpoint recovery; see authoring recipe and captured previous-reader outcome",
          });
          continue;
        }
        if (
          capture &&
          engineName === "chromium" &&
          !existsSync(join(directory, "manifest.json"))
        ) {
          mkdirSync(directory, { recursive: true });
          const writer = await pageFor(engine, artifacts[recipe.schema]);
          const result = await writer.page.evaluate(
            (recipe) => window.compatibility.run("capture", recipe),
            recipe,
          );
          if (writer.errors.length) throw new Error(writer.errors.join("\n"));
          await writer.context.close();
          const previous = await pageFor(engine, artifacts[15]);
          await previous.page.evaluate(
            (source) => window.compatibility.restore(source),
            result.source,
          );
          const oracle = await previous.page.evaluate(
            (recipe) => window.compatibility.run("read", recipe),
            recipe,
          );
          assertEquivalent(
            history(result.source),
            history(oracle.source),
            `${id}: source preservation at capture`,
          );
          if (previous.errors.length)
            throw new Error(previous.errors.join("\n"));
          await previous.context.close();
          rmSync(writer.profile, { recursive: true });
          rmSync(previous.profile, { recursive: true });
          write(join(directory, "source.json.gz"), result.source);
          write(join(directory, "previous-reader.json.gz"), oracle.observation);
          write(join(directory, "manifest.json"), {
            protocol: 1,
            capturedBrowser: `${engineName} ${browser.version()}`,
            writer: identity(
              baselineRoot(recipe.schema),
              revisions[recipe.schema],
            ),
            previousReader: previousIdentity,
            files: {
              "source.json.gz": fileHash(join(directory, "source.json.gz")),
              "previous-reader.json.gz": fileHash(
                join(directory, "previous-reader.json.gz"),
              ),
            },
          });
          console.log(`Captured browser ${id}`);
        }
        if (!existsSync(join(directory, "manifest.json")))
          throw new Error(`Missing browser capture: ${id}`);
        const manifest = read(join(directory, "manifest.json"));
        report.fixtures[id] = {
          writer: manifest.writer,
          files: manifest.files,
        };
        assertEquivalent(
          manifest.previousReader,
          previousIdentity,
          `${id}: pinned browser reader`,
        );
        for (const [path, hash] of Object.entries(manifest.files))
          assertEquivalent(
            hash,
            fileHash(join(directory, path)),
            `${id}: frozen browser ${path}`,
          );
        const source = read(join(directory, "source.json.gz")),
          expected = read(join(directory, "previous-reader.json.gz"));
        const nativeManifest = read(join(pack, "manifest.json"));
        const runtimePath = Object.keys(nativeManifest.files).find((path) =>
          /^expected\/runtime\.json(?:\.gz)?$/.test(path),
        );
        if (!runtimePath)
          throw new Error(`Missing frozen previous runtime: ${id}`);
        assertEquivalent(
          nativeManifest.files[runtimePath],
          fileHash(join(pack, runtimePath)),
          `${id}: frozen runtime bytes`,
        );
        const expectedRuntime = await encodeIdbValue(
          decodeValue(read(join(pack, runtimePath))),
        );
        for (const lane of ["previous", "candidate"]) {
          const fixture = await pageFor(
            engine,
            artifacts[lane === "previous" ? 15 : lane],
          );
          let passed = false;
          try {
            report.activeCase = {
              engine: engineName,
              id,
              lane,
              phase: "restore",
            };
            await fixture.page.evaluate(
              (source) => window.compatibility.restore(source),
              source,
            );
            for (const phase of ["cold", "warm", "cache-cleared"]) {
              report.activeCase.phase = phase;
              if (phase !== "cold") {
                await fixture.page.reload();
                await fixture.page.waitForFunction(() => window.compatibility);
              }
              if (phase === "cache-cleared")
                await fixture.page.evaluate(() =>
                  window.compatibility.clearCaches(),
                );
              const result = await fixture.page.evaluate(
                (recipe) => window.compatibility.run("read", recipe),
                recipe,
              );
              assertEquivalent(
                expected,
                result.observation,
                `${engineName} ${id} ${lane} ${phase}`,
              );
              assertEquivalent(
                expectedRuntime,
                result.runtime,
                `${engineName} ${id} ${lane} ${phase}: logical preview/export`,
              );
              assertEquivalent(
                history(source),
                history(result.source),
                `${engineName} ${id}: persisted history/metadata`,
              );
              if (fixture.errors.length)
                throw new Error(fixture.errors.join("\n"));
              report.cases.push({
                engine: engineName,
                browserVersion: browser.version(),
                id,
                lane,
                phase,
                status: "passed",
                measurements: result.measurements,
              });
            }
            passed = true;
          } catch (error) {
            try {
              write(
                join(workspace, "failed-browser-dump.json.gz"),
                await fixture.page.evaluate(() => window.compatibility.dump()),
              );
            } catch (dumpError) {
              report.dumpError = dumpError.message;
            }
            throw error;
          } finally {
            await fixture.context.close();
            if (passed) rmSync(fixture.profile, { recursive: true });
          }
        }
        console.log(
          `PASS ${engineName} ${id}: previous/candidate cold, warm, cache-cleared`,
        );
      }
    } finally {
      await browser.close();
    }
  }
  report.status = "passed";
  delete report.activeCase;
} catch (error) {
  report.status = "failed";
  report.error = {
    message: error.message,
    difference: error.difference,
    stderr: error.stderr?.toString(),
  };
  console.error(report.error.stderr ?? report.error.message);
  process.exitCode = 1;
} finally {
  write(join(workspace, "report.json"), report);
  console.log(
    `Browser compatibility report: ${join(workspace, "report.json")}`,
  );
}
