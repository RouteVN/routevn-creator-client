import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFont } from "../../src/deps/services/shared/fontLoader.js";

describe("fontLoader", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("times out a stalled decoder and never registers its late result", async () => {
    vi.useFakeTimers();
    const add = vi.fn();
    let finish;
    vi.stubGlobal("document", {
      fonts: { add, [Symbol.iterator]: () => [][Symbol.iterator]() },
    });
    vi.stubGlobal(
      "FontFace",
      class {
        load() {
          return new Promise((resolve) => {
            finish = resolve;
          });
        }
      },
    );
    const loading = loadFont("font-one", "blob:font-one");
    const assertion = expect(loading).rejects.toMatchObject({
      code: "font_load_timeout",
      fileId: "font-one",
    });
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    finish();
    await Promise.resolve();
    expect(add).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("validates replacement uploads even when their family is already loaded", async () => {
    const existing = { family: "Font One" };
    vi.stubGlobal("document", {
      fonts: {
        add: vi.fn(),
        [Symbol.iterator]: () => [existing][Symbol.iterator](),
      },
    });
    vi.stubGlobal(
      "FontFace",
      class {
        async load() {
          throw new Error("decoder rejection");
        }
      },
    );
    await expect(
      loadFont("Font One", "blob:replacement", { cache: false }),
    ).rejects.toMatchObject({ code: "font_load_failed" });
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
