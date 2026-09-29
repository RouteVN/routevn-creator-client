// Stamp each bundle that has a hidden source map with a debug ID, then move
// the maps out of the shipped site so they can be kept privately.
//
// Usage: node scripts/inject-debug-ids.js <site-dir> <maps-dir>
//
// This follows the debug ID convention read by the Sentry JavaScript SDK: the
// bundle registers `globalThis._sentryDebugIds[stack] = id` when it is
// evaluated, and the SDK sends that ID in `debug_meta` with each event. The map
// records the same ID, so error frames can be matched to it exactly.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEBUG_ID_COMMENT = "//# debugId=";

// A content-derived ID keeps rebuilds of identical output stable while any
// change to the bundle or its map produces a new ID.
const createDebugId = (script, map) => {
  const bytes = createHash("sha256")
    .update(script)
    .update("\0")
    .update(map)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
};

// One line, prepended, so the ID is registered before the bundle's own code
// runs. `new Error().stack` names this file, which is how the SDK maps it.
const createRegistrationSnippet = (debugId) =>
  `!function(){try{var g="undefined"!=typeof window?window:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{},s=(new g.Error).stack;s&&(g._sentryDebugIds=g._sentryDebugIds||{},g._sentryDebugIds[s]="${debugId}")}catch(e){}}();`;

const listFiles = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1))
    .sort();

export const injectDebugIds = ({ siteDir, mapsDir }) => {
  const root = resolve(siteDir);
  const mapPaths = listFiles(root).filter((path) => path.endsWith(".map"));
  const files = [];

  for (const mapPath of mapPaths) {
    const scriptPath = mapPath.slice(0, -".map".length);
    if (!scriptPath.endsWith(".js") || !existsSync(join(root, scriptPath))) {
      throw new Error(`No bundle for source map ${mapPath}.`);
    }

    const script = readFileSync(join(root, scriptPath), "utf8");
    const mapSource = readFileSync(join(root, mapPath), "utf8");
    if (script.startsWith("#!") || script.includes(DEBUG_ID_COMMENT)) {
      throw new Error(`Cannot inject a debug ID into ${scriptPath}.`);
    }

    const debugId = createDebugId(script, mapSource);
    const map = JSON.parse(mapSource);
    // The snippet occupies the first generated line.
    map.mappings = `;${map.mappings}`;
    map.debug_id = debugId;
    map.debugId = debugId;

    writeFileSync(
      join(root, scriptPath),
      `${createRegistrationSnippet(debugId)}\n${script}\n${DEBUG_ID_COMMENT}${debugId}\n`,
    );
    const keptMapPath = join(resolve(mapsDir), mapPath);
    mkdirSync(dirname(keptMapPath), { recursive: true });
    writeFileSync(keptMapPath, JSON.stringify(map));
    rmSync(join(root, mapPath));
    files.push({ file: scriptPath, debugId });
  }

  mkdirSync(resolve(mapsDir), { recursive: true });
  writeFileSync(
    join(resolve(mapsDir), "debug-ids.json"),
    `${JSON.stringify({ files }, null, 2)}\n`,
  );
  return files;
};

const isCli = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isCli) {
  const [siteDir, mapsDir] = process.argv.slice(2);
  if (!siteDir || !mapsDir) {
    console.error(
      "Usage: node scripts/inject-debug-ids.js <site-dir> <maps-dir>",
    );
    process.exit(1);
  }
  const files = injectDebugIds({ siteDir, mapsDir });
  if (files.length === 0) {
    console.error(`Error: no source maps found in ${siteDir}.`);
    process.exit(1);
  }
  console.log(
    `Injected debug IDs into ${files.length} bundle(s); source maps moved to ${mapsDir}.`,
  );
}
