import { describe, expect, it, vi } from "vitest";

import {
  normalizeRouteGraphicsAssetLoadInput,
  patchRouteGraphicsAssetParserCompatibility,
} from "../../src/internal/routeGraphicsAssetCompatibility.js";

describe("routeGraphicsAssetCompatibility", () => {
  it("copies parser to loadParser for Pixi builds that only support the legacy name", () => {
    expect(
      normalizeRouteGraphicsAssetLoadInput({
        alias: "video-1",
        src: "blob:http://localhost/video",
        parser: "loadVideo",
        data: {
          mime: "video/mp4",
        },
      }),
    ).toEqual({
      alias: "video-1",
      src: "blob:http://localhost/video",
      parser: "loadVideo",
      loadParser: "loadVideo",
      data: {
        mime: "video/mp4",
      },
    });
  });

  it("leaves existing loadParser values intact", () => {
    expect(
      normalizeRouteGraphicsAssetLoadInput({
        alias: "texture-1",
        src: "blob:http://localhost/texture",
        parser: "loadTextures",
        loadParser: "customParser",
      }),
    ).toEqual({
      alias: "texture-1",
      src: "blob:http://localhost/texture",
      parser: "loadTextures",
      loadParser: "customParser",
    });
  });

  it("patches Assets.load once", async () => {
    const load = vi.fn(async (input) => input);
    const Assets = {
      load,
    };

    patchRouteGraphicsAssetParserCompatibility(Assets);
    patchRouteGraphicsAssetParserCompatibility(Assets);

    await Assets.load({
      alias: "video-1",
      src: "blob:http://localhost/video",
      parser: "loadVideo",
    });

    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(
      {
        alias: "video-1",
        src: "blob:http://localhost/video",
        parser: "loadVideo",
        loadParser: "loadVideo",
      },
      undefined,
    );
  });
});
