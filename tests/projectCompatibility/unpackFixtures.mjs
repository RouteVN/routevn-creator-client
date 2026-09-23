import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { extractArchive } from "./fixtureArchive.mjs";
const target = process.argv[2];
if (!target)
  throw new Error(
    "Usage: node tests/projectCompatibility/unpackFixtures.mjs <new staging directory>",
  );
const destination = resolve(target);
if (existsSync(destination))
  throw new Error(`Refusing to overwrite ${destination}`);
cpSync(await extractArchive(), destination, {
  recursive: true,
  force: false,
  errorOnExist: true,
});
console.log(`Extracted verified fixtures to ${destination}`);
