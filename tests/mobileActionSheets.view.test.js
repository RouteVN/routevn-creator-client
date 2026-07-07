import { readdirSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = new URL("../src/", import.meta.url);

const collectViewFiles = (directoryUrl) => {
  const files = [];

  for (const entry of readdirSync(directoryUrl, { withFileTypes: true })) {
    const entryUrl = new URL(
      `${entry.name}${entry.isDirectory() ? "/" : ""}`,
      directoryUrl,
    );

    if (entry.isDirectory()) {
      files.push(...collectViewFiles(entryUrl));
      continue;
    }

    if (entry.name.endsWith(".view.yaml")) {
      files.push(entryUrl);
    }
  }

  return files;
};

const getIndent = (line) => line.match(/^\s*/)[0].length;

describe("mobile action sheets", () => {
  it("uses prefix icons on secondary action buttons", () => {
    const missingIcons = [];

    for (const fileUrl of collectViewFiles(SOURCE_ROOT)) {
      const lines = readFileSync(fileUrl, "utf8").split("\n");
      const filePath = relative(
        new URL("..", import.meta.url).pathname,
        fileUrl.pathname,
      );

      for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].includes("rvn-mobile-sheet")) {
          continue;
        }

        const sheetIndent = getIndent(lines[i]);

        for (let j = i + 1; j < lines.length; j += 1) {
          const line = lines[j];
          if (line.trim() && getIndent(line) <= sheetIndent) {
            break;
          }

          if (
            line.includes("rtgl-button") &&
            /\bv=se\b/.test(line) &&
            !/\bpre=/.test(line)
          ) {
            missingIcons.push(`${filePath}:${j + 1}: ${line.trim()}`);
          }
        }
      }
    }

    expect(missingIcons).toEqual([]);
  });
});
