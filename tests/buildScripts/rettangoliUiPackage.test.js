import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveRettangoliUiPackage } from "../../scripts/resolve-rettangoli-ui-package.js";

describe("Rettangoli UI package resolution", () => {
  it("uses the declared published version without reading node_modules", () => {
    const readPaths = [];
    const result = resolveRettangoliUiPackage({
      projectRoot: "/project",
      readJson: (path) => {
        readPaths.push(path);
        return {
          dependencies: {
            "@rettangoli/ui": "1.20.0",
          },
        };
      },
    });

    expect(result).toEqual({
      spec: "1.20.0",
      packageDir: "node_modules/@rettangoli/ui",
      version: "1.20.0",
      isLocal: false,
    });
    expect(readPaths).toEqual(["/project/package.json"]);
  });

  it("reads the package version for a local file dependency", () => {
    const result = resolveRettangoliUiPackage({
      projectRoot: "/project/client",
      readJson: (path) => {
        if (path === "/project/client/package.json") {
          return {
            dependencies: {
              "@rettangoli/ui": "file:../rettangoli/packages/rettangoli-ui",
            },
          };
        }

        expect(path).toBe(
          "/project/rettangoli/packages/rettangoli-ui/package.json",
        );
        return { version: "1.21.0" };
      },
    });

    expect(result).toEqual({
      spec: "file:../rettangoli/packages/rettangoli-ui",
      packageDir: "../rettangoli/packages/rettangoli-ui",
      version: "1.21.0",
      isLocal: true,
    });
  });

  it("requires published dependencies to use an exact version", () => {
    expect(() =>
      resolveRettangoliUiPackage({
        projectRoot: "/project",
        readJson: () => ({
          dependencies: {
            "@rettangoli/ui": "^1.20.0",
          },
        }),
      }),
    ).toThrow("must use an exact version or file: dependency");
  });

  it.each(["build.sh", "watch-android.sh", "watch-ios.sh"])(
    "uses the shared resolver from %s",
    (scriptName) => {
      const script = readFileSync(
        new URL(`../../scripts/${scriptName}`, import.meta.url),
        "utf8",
      );

      expect(script).toContain("node scripts/resolve-rettangoli-ui-package.js");
      expect(script).not.toContain(
        'require(require("node:path").resolve(packagePath))',
      );
    },
  );
});
