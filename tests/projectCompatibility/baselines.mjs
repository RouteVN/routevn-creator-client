import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fileHash } from "./records.mjs";
export const revisions = {
  14: "0844141f67bca7e194409095ad6b7a0dd8914053",
  15: "4d1fe31f96ff7a8f4eebf2b58679755a827a8851",
};
export const baselineDirectory = resolve(
  process.env.ROUTEVN_BASELINE_DIRECTORY ?? "/tmp/routevn-validation-baselines",
);
export const baselineRoot = (schema) =>
  join(baselineDirectory, `schema${schema}`);

export function prepareBaselines() {
  for (const [schema, revision] of Object.entries(revisions)) {
    const root = baselineRoot(schema);
    if (!existsSync(join(root, "package.json"))) {
      mkdirSync(root, { recursive: true });
      const archive = execFileSync("git", ["archive", revision], {
        maxBuffer: 128 * 1024 * 1024,
      });
      execFileSync("tar", ["-x", "-C", root], { input: archive });
    }
    // Fail on a mismatched checkout instead of blessing a stale cached reader.
    for (const path of ["package.json", "bun.lock"]) {
      const expected = execFileSync("git", ["show", `${revision}:${path}`]);
      if (!readFileSync(join(root, path)).equals(expected))
        throw new Error(
          `Baseline ${schema}: ${path} does not match ${revision}`,
        );
    }
    execFileSync("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], {
      cwd: root,
      stdio: "inherit",
    });
    const tree = execFileSync(
      "git",
      ["ls-tree", "-r", "--name-only", revision, "src"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");
    for (const path of tree) {
      const expected = execFileSync("git", ["show", `${revision}:${path}`]);
      if (!readFileSync(join(root, path)).equals(expected))
        throw new Error(`Baseline source changed: ${path}`);
    }
  }
}

export function identity(root, revision) {
  const packageJson = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const dependencies = {};
  for (const name of ["@routevn/creator-model", "insieme", "route-engine-js"]) {
    const path = join(root, "node_modules", name, "package.json");
    dependencies[name] = JSON.parse(readFileSync(path, "utf8")).version;
  }
  const hash = createHash("sha256");
  const addTree = (directory) => {
    for (const entry of readdirSync(join(root, directory), {
      withFileTypes: true,
    }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) addTree(path);
      else if (entry.isFile())
        hash.update(path + "\0").update(readFileSync(join(root, path)));
    }
  };
  addTree("src");
  return {
    revision,
    lockfileSha256: fileHash(join(root, "bun.lock")),
    sourceSha256: hash.digest("hex"),
    dependencies,
    declaredModel: packageJson.dependencies["@routevn/creator-model"],
  };
}
