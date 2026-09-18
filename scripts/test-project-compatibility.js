import { fixtureRoot as prepareFixtureRoot } from "../tests/projectCompatibility/fixtureArchive.mjs";
import { readFixtureJson } from "../tests/projectCompatibility/fixtureIO.mjs";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  baselineRoot,
  identity,
  prepareBaselines,
  revisions,
} from "../tests/projectCompatibility/baselines.mjs";
import {
  assertEquivalent,
  assertPreservedSourceRecords,
  fileHash,
  readSourceRecords,
} from "../tests/projectCompatibility/records.mjs";
import { createRecipes } from "../tests/projectCompatibility/recipes.mjs";

const args = process.argv.slice(2);
const capture = args.includes("--capture");
const captureRuntime = args.includes("--capture-runtime");
if (args.includes("--prepare")) prepareBaselines();
const filter = args
  .find((arg) => arg.startsWith("--fixture="))
  ?.slice("--fixture=".length);
const fixtureRoot = await prepareFixtureRoot({
  capture: capture || captureRuntime,
});
const artifactRoot = resolve(
  process.env.ROUTEVN_COMPATIBILITY_ARTIFACTS ?? tmpdir(),
);
mkdirSync(artifactRoot, { recursive: true });
const workspace = mkdtempSync(
  join(artifactRoot, "routevn-project-compatibility-"),
);
const report = {
  protocol: 1,
  status: "running",
  workspace,
  cases: [],
  fixtures: {},
  strictWritesTested: false,
  nativeDeviceTested: false,
};
const read = readFixtureJson;
const write = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const previousIdentity = identity(baselineRoot(15), revisions[15]);
const candidateIdentity = identity(
  process.cwd(),
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
);
report.previousReader = previousIdentity;
report.candidate = candidateIdentity;

function lane(root, mode, project, recipe, result) {
  execFileSync(
    process.execPath,
    [
      "--import",
      resolve("tests/projectCompatibility/nativeHooks.mjs"),
      resolve("tests/projectCompatibility/nativeLane.mjs"),
      root,
      mode,
      project,
      recipe,
      result,
    ],
    { stdio: ["ignore", "pipe", "pipe"], timeout: 300000 },
  );
  return read(result);
}
function cloneSource(source, name) {
  const destination = join(workspace, name);
  cpSync(source, destination, { recursive: true, errorOnExist: true });
  return destination;
}
function verifyHistory(before, after, context) {
  const options = {};
  if (context.startsWith("P07-recovery-no-meta-draft")) {
    options.legacyCheckpointMetadata = {
      historyStats: {
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 2,
      },
    };
  }
  assertPreservedSourceRecords(before, after, context, options);
}
function injectFault(project, fault) {
  const database = new DatabaseSync(join(project, "project.db"));
  try {
    if (fault.startsWith("recovery")) {
      database
        .prepare("DELETE FROM local_drafts WHERE id = ?")
        .run("bootstrap-one");
      const checkpoints = database
        .prepare("SELECT * FROM materialized_view_state")
        .all();
      for (const checkpoint of checkpoints) {
        const value = JSON.parse(checkpoint.value);
        if (checkpoint.view_name === "project_repository_main_state") {
          if (fault === "recovery-no-meta")
            delete value.__routevnCheckpoint.meta;
          else
            value.__routevnCheckpoint.meta.historyStats = {
              committedCount: 0,
              latestCommittedId: 0,
              draftCount: 1,
              latestDraftClock: 2,
            };
        }
        database
          .prepare(
            "UPDATE materialized_view_state SET value = ?, last_committed_id = 1 WHERE view_name = ? AND partition = ?",
          )
          .run(
            JSON.stringify(value),
            checkpoint.view_name,
            checkpoint.partition,
          );
      }
      if (fault === "recovery-missing-scene")
        database
          .prepare(
            "DELETE FROM materialized_view_state WHERE view_name = ? AND partition = ?",
          )
          .run("project_repository_scene_state", "s:783Kx5");
      database
        .prepare(
          "DELETE FROM materialized_view_state WHERE view_name NOT IN (?, ?)",
        )
        .run("project_repository_main_state", "project_repository_scene_state");
    } else if (fault === "duplicate-committed-draft") {
      database
        .prepare(
          `INSERT INTO local_drafts
        (id, partition, type, schema_version, payload, payload_compression, client_ts, created_at)
        SELECT id, partition, type, schema_version, payload, payload_compression, client_ts, created_at
        FROM committed_events WHERE id = 'command-000001'`,
        )
        .run();
    } else if (fault === "obsolete-line-edit") {
      database
        .prepare(
          `INSERT INTO local_drafts
        (id, partition, type, schema_version, payload, payload_compression, client_ts, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "obsolete-edit-one",
          "s:scene-one",
          "line.update_actions",
          1,
          Buffer.from(
            JSON.stringify({
              lineId: "line-one",
              data: { dialogue: { content: "Obsolete edit" } },
            }),
          ),
          null,
          2000,
          2000,
        );
    } else if (fault === "real-version")
      database
        .prepare("UPDATE local_drafts SET schema_version = 1.5 WHERE id = ?")
        .run("command-000001");
    else if (fault === "text-version")
      database
        .prepare("UPDATE local_drafts SET schema_version = ? WHERE id = ?")
        .run("1junk", "command-000001");
    else if (fault === "invalid-draft") {
      const row = database
        .prepare("SELECT payload FROM local_drafts WHERE id = ?")
        .get("command-000003");
      const payload = JSON.parse(Buffer.from(row.payload).toString());
      payload.sceneId = "missing-scene";
      database
        .prepare("UPDATE local_drafts SET payload = ? WHERE id = ?")
        .run(Buffer.from(JSON.stringify(payload)), "command-000003");
    } else throw new Error(`Unknown fault: ${fault}`);
  } finally {
    database.close();
  }
}
try {
  if (capture) {
    for (const recipe of createRecipes().filter(
      (recipe) => !filter || recipe.id.startsWith(filter),
    )) {
      const pack = join(fixtureRoot, recipe.id);
      if (existsSync(pack)) continue; // Never overwrite a frozen oracle on recapture.
      const staging = join(workspace, recipe.id);
      const source = join(staging, "source");
      mkdirSync(join(staging, "expected"), { recursive: true });
      const recipePath = join(staging, "authoring-recipe.json");
      write(recipePath, recipe);
      lane(
        baselineRoot(recipe.schema),
        "capture",
        source,
        recipePath,
        join(staging, "capture.json"),
      );
      if (recipe.sourceCheckpoints)
        lane(
          baselineRoot(15),
          "read",
          source,
          recipePath,
          join(staging, "warm.json"),
        );
      const parentHash = fileHash(join(source, "project.db"));
      if (recipe.fault) injectFault(source, recipe.fault);
      const sourceRecords = readSourceRecords(join(source, "project.db"));
      const previous = lane(
        baselineRoot(15),
        "read",
        cloneSource(source, `${recipe.id}-oracle`),
        recipePath,
        join(staging, "oracle.json"),
      );
      verifyHistory(
        sourceRecords,
        previous.sourceRecords,
        `${recipe.id} capture`,
      );
      write(
        join(staging, "expected/previous-reader.json"),
        previous.observation,
      );
      write(join(staging, "expected/source-records.json"), sourceRecords);
      write(
        join(staging, "expected/asset-hashes.json"),
        Object.fromEntries(
          (recipe.assetFiles ?? []).map((file) => [file.id, file.sha256]),
        ),
      );
      const manifest = {
        protocol: 1,
        id: recipe.id,
        origin: recipe.fault ? "fault-injected" : "old-writer",
        platform: "sqlite-native-bridge",
        writer: identity(baselineRoot(recipe.schema), revisions[recipe.schema]),
        previousReader: previousIdentity,
        fault: recipe.fault,
        parentDatabaseSha256: recipe.fault ? parentHash : undefined,
        files: {},
        coverage: {
          open: true,
          fullState: true,
          rawHistory: true,
          assets: Boolean(recipe.assetFiles),
          runtime: false,
          backupRestore: false,
          nativeDevice: false,
          strictUpgrade: false,
        },
      };
      for (const path of [
        "authoring-recipe.json",
        "source/project.db",
        "expected/previous-reader.json",
        "expected/source-records.json",
        "expected/asset-hashes.json",
      ])
        manifest.files[path] = fileHash(join(staging, path));
      for (const file of recipe.assetFiles ?? [])
        manifest.files[`source/files/${file.id}`] = file.sha256;
      write(join(staging, "manifest.json"), manifest);
      rmSync(join(staging, "capture.json"));
      rmSync(join(staging, "oracle.json"));
      rmSync(join(staging, "warm.json"), { force: true });
      cpSync(staging, pack, { recursive: true, errorOnExist: true });
      console.log(`Captured ${recipe.id} from schema ${recipe.schema} writer`);
    }
  }
  const packs = readdirSync(fixtureRoot)
    .filter(
      (name) =>
        existsSync(join(fixtureRoot, name, "manifest.json")) &&
        (!filter || name.startsWith(filter)),
    )
    .sort();
  const required = createRecipes()
    .map((recipe) => recipe.id)
    .filter((id) => !filter || id.startsWith(filter));
  if (!required.length) throw new Error("Unknown fixture filter");
  for (const id of required)
    if (!packs.includes(id))
      throw new Error(`Missing required frozen pack: ${id}`);
  if (packs.length === 0)
    throw new Error("No captured packs; baseline coverage cannot be skipped");
  for (const id of packs) {
    const pack = join(fixtureRoot, id);
    const manifest = read(join(pack, "manifest.json"));
    report.fixtures[id] = { writer: manifest.writer, files: manifest.files };
    assertEquivalent(
      manifest.previousReader,
      previousIdentity,
      `${id}: pinned previous reader`,
    );
    for (const [path, hash] of Object.entries(manifest.files))
      assertEquivalent(
        hash,
        fileHash(join(pack, path)),
        `${id}: immutable ${path}`,
      );
    const expected = read(join(pack, "expected/previous-reader.json"));
    const before = read(join(pack, "expected/source-records.json"));
    if (
      captureRuntime &&
      !manifest.files["expected/runtime.json"] &&
      !manifest.files["expected/runtime.json.gz"]
    ) {
      const runtimeSource = cloneSource(
        join(pack, "source"),
        `${id}-runtime-oracle`,
      );
      const oracle = lane(
        baselineRoot(15),
        "read",
        runtimeSource,
        join(pack, "authoring-recipe.json"),
        join(workspace, `${id}-runtime-oracle.json`),
      );
      assertEquivalent(
        expected,
        oracle.observation,
        `${id}: unchanged frozen state while adding runtime coverage`,
      );
      verifyHistory(before, oracle.sourceRecords, `${id}: runtime source`);
      write(
        join(pack, "expected/runtime.json"),
        oracle.runtime ?? { status: "repository-unavailable" },
      );
      manifest.files["expected/runtime.json"] = fileHash(
        join(pack, "expected/runtime.json"),
      );
      manifest.coverage.runtime = true;
      write(join(pack, "manifest.json"), manifest);
    }
    const expectedRuntime =
      manifest.files["expected/runtime.json"] ||
      manifest.files["expected/runtime.json.gz"]
        ? read(join(pack, "expected/runtime.json"))
        : undefined;
    if (!expectedRuntime)
      throw new Error(`Missing frozen runtime oracle: ${id}`);
    const recipe = join(pack, "authoring-recipe.json");
    for (const [name, root] of [
      ["previous", baselineRoot(15)],
      ["candidate", process.cwd()],
    ]) {
      const project = cloneSource(join(pack, "source"), `${id}-${name}`);
      for (const phase of ["cold", "warm", "cache-cleared"]) {
        report.activeCase = { id, lane: name, phase };
        if (phase === "cache-cleared") {
          const db = new DatabaseSync(join(project, "project.db"));
          if (read(recipe).sourceCheckpoints)
            db.prepare(
              "DELETE FROM materialized_view_state WHERE view_name NOT IN (?, ?)",
            ).run(
              "project_repository_main_state",
              "project_repository_scene_state",
            );
          else db.exec("DELETE FROM materialized_view_state");
          db.close();
        }
        const result = lane(
          root,
          "read",
          project,
          recipe,
          join(workspace, `${id}-${name}-${phase}.json`),
        );
        assertEquivalent(
          expected,
          result.observation,
          `${id} ${name} ${phase}`,
        );
        for (const [fileId, hash] of Object.entries(
          read(join(pack, "expected/asset-hashes.json")),
        ))
          assertEquivalent(
            hash,
            fileHash(join(project, "files", fileId)),
            `${id}: preserved asset ${fileId}`,
          );
        verifyHistory(before, result.sourceRecords, `${id} ${name} ${phase}`);
        if (expectedRuntime)
          assertEquivalent(
            expectedRuntime,
            result.runtime ?? { status: "repository-unavailable" },
            `${id} ${name} ${phase}: runtime`,
          );
        report.cases.push({
          id,
          lane: name,
          phase,
          status: "passed",
          measurements: result.measurements,
        });
      }
    }
    console.log(
      `PASS ${id}: previous/candidate cold, warm, cache-cleared; original row bytes intact`,
    );
  }
  if (args.includes("--all")) {
    execFileSync(
      "bunx",
      [
        "vitest",
        "run",
        "tests/projectCompatibility/records.test.js",
        "tests/projectCompatibility/fixtureArchive.test.js",
      ],
      { stdio: "inherit" },
    );
    execFileSync(
      process.execPath,
      filter
        ? [
            "tests/projectCompatibility/browserRunner.mjs",
            `--fixture=${filter}`,
          ]
        : ["tests/projectCompatibility/browserRunner.mjs"],
      { stdio: "inherit" },
    );
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
  const reportPath = resolve(
    process.env.ROUTEVN_COMPATIBILITY_REPORT ?? join(workspace, "report.json"),
  );
  write(reportPath, report);
  if (report.status === "passed") {
    for (const name of readdirSync(workspace)) {
      const path = join(workspace, name);
      if (path !== reportPath) rmSync(path, { recursive: true, force: true });
    }
  }
  console.log(`Compatibility report: ${reportPath}`);
}
