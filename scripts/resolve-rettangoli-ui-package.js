import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXACT_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const readJsonFile = (path) => JSON.parse(readFileSync(path, "utf8"));

export const resolveRettangoliUiPackage = ({
  projectRoot = process.cwd(),
  readJson = readJsonFile,
} = {}) => {
  const packageJson = readJson(resolve(projectRoot, "package.json"));
  const spec = packageJson.dependencies?.["@rettangoli/ui"];

  if (!spec) {
    throw new Error(
      "@rettangoli/ui is missing from package.json dependencies.",
    );
  }

  if (spec.startsWith("file:")) {
    const packageDir = spec.slice("file:".length);
    const localPackageJson = readJson(
      resolve(projectRoot, packageDir, "package.json"),
    );

    return {
      spec,
      packageDir,
      version: localPackageJson.version,
      isLocal: true,
    };
  }

  if (!EXACT_VERSION_PATTERN.test(spec)) {
    throw new Error(
      `@rettangoli/ui must use an exact version or file: dependency; received ${spec}.`,
    );
  }

  return {
    spec,
    packageDir: "node_modules/@rettangoli/ui",
    version: spec,
    isLocal: false,
  };
};

const isCli = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isCli) {
  try {
    const { packageDir, version, isLocal } = resolveRettangoliUiPackage();
    process.stdout.write([packageDir, version, String(isLocal)].join("\t"));
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
}
