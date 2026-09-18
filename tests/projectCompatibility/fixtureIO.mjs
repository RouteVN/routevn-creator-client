import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
export function readFixtureJson(path) {
  const compressedPath = path.endsWith(".gz") ? path : `${path}.gz`;
  if (!path.endsWith(".gz") && existsSync(path))
    return JSON.parse(readFileSync(path, "utf8"));
  return JSON.parse(gunzipSync(readFileSync(compressedPath)).toString("utf8"));
}
