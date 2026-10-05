import { describe, expect, it } from "vitest";
import { dataUrlToBlob } from "../../src/internal/dataUrl.js";

describe("dataUrlToBlob", () => {
  it("decodes a base64 data URL with its type", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,cHJldmlldw==");

    expect(blob.type).toBe("image/png");
    expect(await blob.text()).toBe("preview");
  });

  it("decodes a plain data URL, and a missing type as bytes", async () => {
    const blob = dataUrlToBlob("data:,hello%20world");

    expect(blob.type).toBe("application/octet-stream");
    expect(await blob.text()).toBe("hello world");
  });

  it("rejects a value that is not a data URL", () => {
    expect(() => dataUrlToBlob("")).toThrow("not a valid data URL");
    expect(() => dataUrlToBlob("blob:file-1,abc")).toThrow(
      "not a valid data URL",
    );
  });
});
