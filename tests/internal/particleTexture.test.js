import { describe, expect, it } from "vitest";
import {
  createRenderableParticleData,
  isRenderableParticleTexture,
} from "../../src/internal/particles.js";

// Each texture is checked against what route-graphics accepts, as
// createRenderableParticleData resolves it.
describe("isRenderableParticleTexture", () => {
  it.each([
    ["an image file", "file-1"],
    ["a built-in shape name", "snowflake"],
    ["a shape", { shape: "circle", radius: 4, color: "#ffffff" }],
    ["one image", { mode: "single", items: [{ src: "file-1" }] }],
    [
      "images picked at random per wave",
      {
        mode: "random",
        pick: "perWave",
        items: [{ src: "file-1" }, { shape: "rect", width: 2, height: 6 }],
      },
    ],
  ])("accepts %s", (_case, texture) => {
    expect(isRenderableParticleTexture(texture)).toBe(true);
  });

  it.each([
    ["no texture", undefined],
    ["an empty name", ""],
    ["a list", ["file-1"]],
    ["an unknown shape", { shape: "star" }],
    ["a shape with a text radius", { shape: "circle", radius: "4" }],
    ["no mode", { items: [{ src: "file-1" }] }],
    ["an unknown mode", { mode: "shuffle", items: [{ src: "file-1" }] }],
    [
      "an unknown pick",
      { mode: "random", pick: "perFrame", items: [{ src: "file-1" }] },
    ],
    ["no items", { mode: "random", items: [] }],
    [
      "two items for a single image",
      { mode: "single", items: [{ src: "file-1" }, { src: "file-2" }] },
    ],
    [
      "an item source that is not text",
      { mode: "random", items: [{ src: 42 }] },
    ],
    ["an item with no source", { mode: "cycle", items: [{}] }],
  ])("rejects %s", (_case, texture) => {
    expect(isRenderableParticleTexture(texture)).toBe(false);
  });
});

describe("createRenderableParticleData", () => {
  it("keeps a numeric seed and drops any other", () => {
    expect(createRenderableParticleData({ seed: 0 }).seed).toBe(0);
    for (const seed of [null, "", "12", Number.NaN, Infinity]) {
      expect(createRenderableParticleData({ seed })).not.toHaveProperty("seed");
    }
  });
});
