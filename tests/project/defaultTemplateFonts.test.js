import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { extractFontWeightCapabilities } from "../../src/internal/fontCapabilities.js";

const repository = JSON.parse(
  readFileSync(
    new URL("../../static/templates/default/repository.json", import.meta.url),
    "utf8",
  ),
);

const fontCases = [
  {
    fontId: "7m7oC7i8JTEE",
    fileId: "Rp37wKfpY5os",
    weight: 400,
  },
  {
    fontId: "VWNPTSU9Rbn9",
    fileId: "Jh8TM82HqieT",
    weight: 600,
  },
];

describe("default template fonts", () => {
  it.each(fontCases)(
    "ships a real static $weight TTF with matching metadata",
    ({ fontId, fileId, weight }) => {
      const font = repository.fonts.items[fontId];
      const file = repository.files.items[fileId];
      const bytes = readFileSync(
        new URL(
          `../../static/templates/default/files/${fileId}`,
          import.meta.url,
        ),
      );

      expect(font.fileId).toBe(fileId);
      expect(file.mimeType).toBe("font/ttf");
      expect(file.size).toBe(bytes.byteLength);
      expect(file.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
      expect(extractFontWeightCapabilities(bytes)).toEqual({
        kind: "static",
        defaultWeight: weight,
        minWeight: weight,
        maxWeight: weight,
      });
    },
  );

  it("uses the 600 font resource for every 600-weight default style", () => {
    const textStyles = Object.values(repository.textStyles.items).filter(
      (item) => item.type === "textStyle",
    );

    expect(
      textStyles
        .filter((item) => item.fontWeight === "600")
        .map((item) => item.fontId),
    ).toEqual(["VWNPTSU9Rbn9", "VWNPTSU9Rbn9", "VWNPTSU9Rbn9", "VWNPTSU9Rbn9"]);
    expect(textStyles.some((item) => item.fontWeight === "700")).toBe(false);
  });
});
