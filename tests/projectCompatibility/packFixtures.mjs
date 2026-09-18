// Deterministic, lossless packaging. Existing archived files may never change.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  archivePath,
  manifestPath,
  assertFrozenFiles,
  collectFiles,
  createArchive,
} from "./fixtureArchive.mjs";
const source = process.argv[2];
if (!source)
  throw new Error(
    "Usage: node tests/projectCompatibility/packFixtures.mjs <fixture staging directory>",
  );
const root = resolve(source);
const files = collectFiles(root);
if (existsSync(manifestPath))
  assertFrozenFiles(
    JSON.parse(readFileSync(manifestPath, "utf8")).files,
    files,
  );
const fixtures = [];
const identities = {};
const identityKey = (identity) => {
  const key = identity.revision;
  if (
    identities[key] &&
    JSON.stringify(identities[key]) !== JSON.stringify(identity)
  )
    throw new Error(`Conflicting baseline identity: ${key}`);
  identities[key] = identity;
  return key;
};
for (const id of readdirSync(root).sort()) {
  const path = join(root, id, "manifest.json");
  if (!existsSync(path)) continue;
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  const verifyManifest = (manifest, prefix) => {
    for (const [path, sha256] of Object.entries(manifest.files)) {
      if (files[`${prefix}/${path}`]?.sha256 !== sha256)
        throw new Error(`Captured manifest mismatch: ${prefix}/${path}`);
    }
  };
  verifyManifest(manifest, id);
  const fixture = {
    id,
    origin: manifest.origin,
    writer: identityKey(manifest.writer),
    previousReader: identityKey(manifest.previousReader),
    sqlite: true,
    browser: existsSync(join(root, id, "browser/manifest.json")),
  };
  if (manifest.fault) fixture.fault = manifest.fault;
  if (fixture.browser)
    verifyManifest(
      JSON.parse(readFileSync(join(root, id, "browser/manifest.json"), "utf8")),
      `${id}/browser`,
    );
  fixtures.push(fixture);
}
if (!fixtures.length) throw new Error("No captured fixtures found");
const archive = await createArchive(root, files);
const manifest = {
  protocol: 1,
  archive: {
    file: basename(archivePath),
    sha256: createHash("sha256").update(archive).digest("hex"),
    bytes: archive.length,
  },
  identities,
  fixtures,
};
// One file entry per line keeps the reviewable inventory compact.
const header = JSON.stringify(manifest, null, 2).slice(0, -2);
const inventory = Object.entries(files)
  .map(
    ([path, record]) =>
      `    ${JSON.stringify(path)}: ${JSON.stringify(record)}`,
  )
  .join(",\n");
writeFileSync(archivePath, archive);
writeFileSync(manifestPath, `${header},\n  "files": {\n${inventory}\n  }\n}\n`);
console.log(
  `Packed ${fixtures.length} fixtures (${Object.keys(files).length} files) into ${archive.length} bytes`,
);
