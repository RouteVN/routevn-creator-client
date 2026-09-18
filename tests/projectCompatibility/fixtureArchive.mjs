import JSZip from "jszip";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export const archivePath = resolve("tests/fixtures/legacy-projects.zip");
export const manifestPath = resolve(
  "tests/fixtures/legacy-projects.manifest.json",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safePath = (path) => {
  if (
    !path ||
    path.includes("\\") ||
    path
      .split("/")
      .some(
        (part) => !part || part === "." || part === ".." || part.includes(":"),
      )
  )
    throw new Error(`Unsafe fixture path: ${path}`);
};

export function collectFiles(root, prefix = "") {
  const files = {};
  for (const name of readdirSync(join(root, prefix)).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    safePath(path);
    const info = lstatSync(join(root, path));
    if (info.isDirectory()) Object.assign(files, collectFiles(root, path));
    else if (info.isFile()) {
      const bytes = readFileSync(join(root, path));
      files[path] = { sha256: hash(bytes), bytes: bytes.length };
    } else throw new Error(`Unsupported fixture entry: ${path}`);
  }
  return files;
}

export function assertFrozenFiles(previous, current) {
  for (const [path, expected] of Object.entries(previous)) {
    const actual = current[path];
    if (
      !actual ||
      actual.sha256 !== expected.sha256 ||
      actual.bytes !== expected.bytes
    )
      throw new Error(
        `Frozen fixture changed or removed: ${path}; add a new variant instead`,
      );
  }
}

export async function createArchive(root, files = collectFiles(root)) {
  const zip = new JSZip();
  for (const path of Object.keys(files).sort()) {
    const bytes = readFileSync(join(root, path));
    if (hash(bytes) !== files[path].sha256)
      throw new Error(`Fixture changed while packing: ${path}`);
    zip.file(path, bytes, {
      date: new Date("1980-01-01T00:00:00Z"),
      createFolders: false,
    });
  }
  return zip.generateAsync({
    type: "nodebuffer",
    platform: "DOS",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
}

export async function extractArchive({
  archive = archivePath,
  manifest = manifestPath,
  cache = process.env.ROUTEVN_FIXTURE_CACHE ??
    join(tmpdir(), "routevn-fixture-cache"),
} = {}) {
  const catalog = JSON.parse(readFileSync(manifest, "utf8"));
  const bytes = readFileSync(archive);
  if (
    catalog.protocol !== 1 ||
    bytes.length !== catalog.archive.bytes ||
    hash(bytes) !== catalog.archive.sha256
  )
    throw new Error("Fixture archive does not match its manifest");
  for (const path of Object.keys(catalog.files)) safePath(path);
  mkdirSync(cache, { recursive: true });
  const destination = join(cache, catalog.archive.sha256);
  const verify = (root) => {
    const actual = collectFiles(root);
    assertFrozenFiles(catalog.files, actual);
    if (Object.keys(actual).length !== Object.keys(catalog.files).length)
      throw new Error("Unexpected files in fixture cache");
  };
  if (existsSync(destination)) {
    verify(destination);
    return destination;
  }
  const staging = mkdtempSync(join(cache, ".extract-"));
  try {
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const paths = Object.keys(zip.files);
    if (paths.length !== Object.keys(catalog.files).length)
      throw new Error("Fixture archive inventory mismatch");
    for (const path of paths) {
      const entry = zip.files[path];
      if (
        entry.dir ||
        entry.unsafeOriginalName !== path ||
        !Object.hasOwn(catalog.files, path)
      )
        throw new Error(`Unexpected archive entry: ${path}`);
      safePath(path);
      const content = await entry.async("nodebuffer");
      const expected = catalog.files[path];
      if (
        content.length !== expected.bytes ||
        hash(content) !== expected.sha256
      )
        throw new Error(`Fixture file hash mismatch: ${path}`);
      mkdirSync(dirname(join(staging, path)), { recursive: true });
      writeFileSync(join(staging, path), content, { flag: "wx" });
    }
    verify(staging);
    try {
      renameSync(staging, destination);
    } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
      verify(destination); // Another runner may have finished the same extraction.
    }
    return destination;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export async function fixtureRoot({ capture = false } = {}) {
  if (!capture) return extractArchive();
  const staging = process.env.ROUTEVN_FIXTURE_DIRECTORY;
  if (!staging)
    throw new Error(
      "Capture requires ROUTEVN_FIXTURE_DIRECTORY pointing to an explicit staging directory; see the harness README",
    );
  return resolve(staging);
}
