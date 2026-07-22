import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFont } from "../../src/deps/services/shared/fontLoader.js";

describe("fontLoader", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("registers and caches a font face by family and weight descriptor", async () => {
    const fontFaces = [];
    const fontFaceSet = {
      add: vi.fn((fontFace) => fontFaces.push(fontFace)),
      [Symbol.iterator]: () => fontFaces[Symbol.iterator](),
    };
    class FontFace {
      static calls = [];

      constructor(family, source, descriptors) {
        FontFace.calls.push([family, source, descriptors]);
        this.family = family;
        this.source = source;
        this.weight = descriptors.weight ?? "normal";
      }

      async load() {
        return this;
      }
    }
    vi.stubGlobal("document", { fonts: fontFaceSet });
    vi.stubGlobal("FontFace", FontFace);

    const first = await loadFont("Semibold", "font://semibold", {
      weight: "600",
    });
    const second = await loadFont("Semibold", "font://semibold", {
      weight: "600",
    });

    expect(first.weight).toBe("600");
    expect(second).toBe(first);
    expect(FontFace.calls).toEqual([
      ["Semibold", "url(font://semibold)", { weight: "600" }],
    ]);
    expect(fontFaceSet.add).toHaveBeenCalledOnce();
  });
});
