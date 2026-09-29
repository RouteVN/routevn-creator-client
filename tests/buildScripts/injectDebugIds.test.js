import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { injectDebugIds } from "../../scripts/inject-debug-ids.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("debug ID injection", () => {
  const dirs = [];
  const createDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "routevn-debug-ids-"));
    dirs.push(dir);
    return dir;
  };
  const write = (root, path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const createMap = (file, mappings) =>
    JSON.stringify({
      version: 3,
      file,
      sources: ["../src/one.js"],
      names: [],
      mappings,
    });

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stamps mapped bundles and moves their maps out of the site", () => {
    const site = createDir();
    const maps = join(createDir(), "maps");
    write(site, "public/main.js", "console.log(1);");
    write(site, "public/main.js.map", createMap("main.js", "AAAA;AACA"));
    write(site, "public/chunks/one-abc.js", "export const one = 1;");
    write(site, "public/chunks/one-abc.js.map", createMap("one-abc.js", "AAAA"));
    write(site, "public/unmapped.js", "console.log(2);");

    const files = injectDebugIds({ siteDir: site, mapsDir: maps });

    expect(files.map(({ file }) => file)).toEqual([
      "public/chunks/one-abc.js",
      "public/main.js",
    ]);
    for (const { file, debugId } of files) {
      expect(debugId).toMatch(UUID);
      expect(existsSync(join(site, `${file}.map`))).toBe(false);
      const script = readFileSync(join(site, file), "utf8");
      const lines = script.split("\n");
      expect(lines[0]).toContain(`"${debugId}"`);
      expect(lines.at(-2)).toBe(`//# debugId=${debugId}`);
      const map = JSON.parse(readFileSync(join(maps, `${file}.map`), "utf8"));
      expect(map).toMatchObject({ debug_id: debugId, debugId });
    }

    const mainScript = readFileSync(join(site, "public/main.js"), "utf8");
    expect(mainScript.split("\n")[1]).toBe("console.log(1);");
    const mainMap = JSON.parse(
      readFileSync(join(maps, "public/main.js.map"), "utf8"),
    );
    // One generated line was prepended, so every mapping moves down one line.
    expect(mainMap.mappings).toBe(";AAAA;AACA");
    expect(readFileSync(join(site, "public/unmapped.js"), "utf8")).toBe(
      "console.log(2);",
    );
    expect(
      JSON.parse(readFileSync(join(maps, "debug-ids.json"), "utf8")),
    ).toEqual({ files });
  });

  it("registers the ID under the bundle's own stack when evaluated", () => {
    const site = createDir();
    write(site, "public/main.js", "console.log(1);");
    write(site, "public/main.js.map", createMap("main.js", "AAAA"));

    const [{ debugId }] = injectDebugIds({
      siteDir: site,
      mapsDir: join(createDir(), "maps"),
    });
    const context = { console: { log: () => {} } };
    runInNewContext(readFileSync(join(site, "public/main.js"), "utf8"), context, {
      filename: "https://app.test/public/main.js",
    });

    const entries = Object.entries(context._sentryDebugIds);
    expect(entries).toHaveLength(1);
    expect(entries[0][0]).toContain("https://app.test/public/main.js");
    expect(entries[0][1]).toBe(debugId);
  });

  it("derives IDs from bundle and map content", () => {
    const stamp = (script, mappings) => {
      const site = createDir();
      write(site, "main.js", script);
      write(site, "main.js.map", createMap("main.js", mappings));
      return injectDebugIds({ siteDir: site, mapsDir: join(createDir(), "m") })[0]
        .debugId;
    };

    expect(stamp("a();", "AAAA")).toBe(stamp("a();", "AAAA"));
    expect(stamp("a();", "AAAA")).not.toBe(stamp("b();", "AAAA"));
    expect(stamp("a();", "AAAA")).not.toBe(stamp("a();", "AACA"));
  });

  it("refuses maps without a bundle and bundles injected twice", () => {
    const orphan = createDir();
    write(orphan, "style.css.map", createMap("style.css", "AAAA"));
    expect(() =>
      injectDebugIds({ siteDir: orphan, mapsDir: join(createDir(), "m") }),
    ).toThrow("No bundle for source map style.css.map.");

    const twice = createDir();
    write(twice, "main.js", "a();\n//# debugId=00000000-0000-4000-8000-000000000000\n");
    write(twice, "main.js.map", createMap("main.js", "AAAA"));
    expect(() =>
      injectDebugIds({ siteDir: twice, mapsDir: join(createDir(), "m") }),
    ).toThrow("Cannot inject a debug ID into main.js.");
  });
});
