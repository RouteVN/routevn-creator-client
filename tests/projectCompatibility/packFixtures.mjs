// Lossless packaging only: never regenerate an oracle, source row or recipe.
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { fileHash, sha256 } from "./records.mjs";
const root = "tests/fixtures/legacy-projects";
for (const id of readdirSync(root)) {
  const pack = join(root, id),
    manifestPath = join(pack, "manifest.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath));
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (!path.endsWith(".json")) continue;
    const bytes = readFileSync(join(pack, path));
    if (bytes.length < 64 * 1024) continue;
    if (sha256(bytes) !== hash)
      throw new Error(`Source changed before packaging: ${id}/${path}`);
    const compressed = gzipSync(bytes, { level: 9 });
    if (!gunzipSync(compressed).equals(bytes))
      throw new Error("Lossless packing assertion failed");
    writeFileSync(join(pack, `${path}.gz`), compressed, { flag: "wx" });
    manifest.uncompressedFiles ??= {};
    manifest.uncompressedFiles[`${path}.gz`] = hash;
    manifest.files[`${path}.gz`] = fileHash(join(pack, `${path}.gz`));
    delete manifest.files[path];
    unlinkSync(join(pack, path));
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}
