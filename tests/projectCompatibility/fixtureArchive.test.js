import { afterEach, beforeEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  assertFrozenFiles,
  collectFiles,
  createArchive,
  extractArchive,
} from "./fixtureArchive.mjs";
let directory;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "rvn-archive-test-"));
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function pack() {
  const root = join(directory, "source");
  mkdirSync(join(root, "Project One"), { recursive: true });
  writeFileSync(
    join(root, "Project One/data.bin"),
    Buffer.from([0, 255, 4, 128]),
  );
  writeFileSync(join(root, "manifest.json"), '{"second":2,"first":1}\n');
  const files = collectFiles(root);
  const bytes = await createArchive(root, files);
  const paths = {
    archive: join(directory, "fixtures.zip"),
    manifest: join(directory, "inventory.json"),
    cache: join(directory, "cache"),
  };
  const manifest = {
    protocol: 1,
    archive: { bytes: bytes.length, sha256: hash(bytes) },
    files,
  };
  writeFileSync(paths.archive, bytes);
  writeFileSync(paths.manifest, JSON.stringify(manifest));
  return { root, files, bytes, paths, manifest };
}
it("produces identical archives regardless of file creation order and timestamps", async () => {
  const { root, bytes, files } = await pack();
  const reordered = join(directory, "reordered");
  mkdirSync(join(reordered, "Project One"), { recursive: true });
  const reversed = Object.fromEntries(Object.entries(files).reverse());
  for (const path of Object.keys(reversed)) {
    writeFileSync(join(reordered, path), readFileSync(join(root, path)));
    utimesSync(join(reordered, path), 1234567890, 1234567890);
  }
  expect(await createArchive(reordered, reversed)).toEqual(bytes);
});
it("extracts exact bytes and safely shares the cache between concurrent runners", async () => {
  const { files, paths } = await pack();
  const [first, second] = await Promise.all([
    extractArchive(paths),
    extractArchive(paths),
  ]);
  expect(first).toBe(second);
  expect(collectFiles(first)).toEqual(files);
  expect(await extractArchive(paths)).toBe(first);
});
it("rejects archive corruption even when an extracted cache exists", async () => {
  const { bytes, paths } = await pack();
  await extractArchive(paths);
  bytes[0] ^= 1;
  writeFileSync(paths.archive, bytes);
  await expect(extractArchive(paths)).rejects.toThrow(/archive does not match/);
});
it("rejects corrupted individual file hashes and modified cache files", async () => {
  const { paths, manifest } = await pack();
  const root = await extractArchive(paths);
  writeFileSync(join(root, "manifest.json"), "changed");
  await expect(extractArchive(paths)).rejects.toThrow(/Frozen fixture changed/);
  rmSync(paths.cache, { recursive: true });
  manifest.files["manifest.json"].sha256 = "0".repeat(64);
  writeFileSync(paths.manifest, JSON.stringify(manifest));
  await expect(extractArchive(paths)).rejects.toThrow(/file hash mismatch/);
});
it("rejects unsafe inventory paths before extraction", async () => {
  const { paths, manifest } = await pack();
  manifest.files["../outside"] = manifest.files["manifest.json"];
  writeFileSync(paths.manifest, JSON.stringify(manifest));
  await expect(extractArchive(paths)).rejects.toThrow(/Unsafe fixture path/);
});
it("allows new fixtures but refuses to replace or remove historical files", async () => {
  const { files } = await pack();
  const added = {
    ...files,
    "new-case.json": { sha256: hash("new"), bytes: 3 },
  };
  expect(() => assertFrozenFiles(files, added)).not.toThrow();
  const changed = structuredClone(files);
  changed["manifest.json"].sha256 = hash("changed");
  expect(() => assertFrozenFiles(files, changed)).toThrow(
    /Frozen fixture changed/,
  );
  delete changed["manifest.json"];
  expect(() => assertFrozenFiles(files, changed)).toThrow(
    /Frozen fixture changed/,
  );
});
