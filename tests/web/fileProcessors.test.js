import { describe, expect, it } from "vitest";

import { detectFileType } from "../../src/deps/clients/web/fileProcessors.js";

describe("fileProcessors.detectFileType", () => {
  it("classifies image blobs without a file name from mime type", () => {
    expect(
      detectFileType({
        type: "image/webp",
      }),
    ).toBe("image");
  });
});
