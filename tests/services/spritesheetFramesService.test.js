import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/deps/clients/web/imageTexture.js", () => ({
  getMaxTextureSize: vi.fn(() => 4096),
}));

vi.mock("../../src/deps/clients/web/spritesheetCanvas.js", () => ({
  renderSpritesheetImage: vi.fn(async () => new Blob(["sheet"])),
  cropSpritesheetFrames: vi.fn(async ({ crops }) =>
    crops.map((crop) => new Blob([crop.name])),
  ),
  readImageSizeFromUrl: vi.fn(async () => ({ width: 16, height: 16 })),
}));

const { createSpritesheetFramesService } = await import(
  "../../src/deps/services/shared/spritesheetFramesService.js"
);
const { readImageSizeFromUrl, renderSpritesheetImage } = await import(
  "../../src/deps/clients/web/spritesheetCanvas.js"
);

const createService = () => {
  const uploadFiles = vi.fn(async (files) =>
    files.map((file) => ({
      success: true,
      file,
      fileId: `uploaded-${file.name}`,
      thumbnailFileId: file.name.startsWith("Blink")
        ? "sheet-thumb"
        : undefined,
      fileRecords: [{ id: `uploaded-${file.name}` }],
    })),
  );
  const getFileContent = vi.fn(async (fileId) => ({
    url: `https://files.test/${fileId}`,
    revoke: vi.fn(),
  }));

  return {
    uploadFiles,
    getFileContent,
    service: createSpritesheetFramesService({ uploadFiles, getFileContent }),
  };
};

const clip = (entries) => ({ name: "default", entries, fps: 12, loop: true });

describe("spritesheetFramesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob(["file"]),
      })),
    );
  });

  it("uploads only new pictures and records every frame in order", async () => {
    const { service, uploadFiles } = createService();
    const newFile = new File(["b"], "b.png", { type: "image/png" });

    const result = await service.buildSpritesheetFromFrames({
      frames: [
        {
          key: "a",
          name: "a",
          width: 16,
          height: 16,
          url: "blob:a",
          fileId: "saved-a",
        },
        {
          key: "b",
          name: "b",
          width: 16,
          height: 16,
          url: "blob:b",
          file: newFile,
        },
      ],
      clips: [
        clip([
          { key: "e1", frameKey: "b", hold: 1 },
          { key: "e2", frameKey: "a", hold: 2 },
        ]),
      ],
      name: "Blink",
    });

    expect(uploadFiles).toHaveBeenNthCalledWith(1, [newFile], {
      skipImageThumbnail: true,
    });
    expect(uploadFiles.mock.calls[1][0][0].name).toBe("Blink.png");
    expect(renderSpritesheetImage).toHaveBeenCalled();
    expect(result.data).toMatchObject({
      fileId: "uploaded-Blink.png",
      thumbnailFileId: "sheet-thumb",
      frameCount: 2,
      animations: { default: { frames: [1, 0, 0], fps: 12, loop: true } },
      frameSource: {
        frameWidth: 16,
        frameHeight: 16,
        frames: [{ fileId: "saved-a" }, { fileId: "uploaded-b.png" }],
      },
    });
    expect(result.data.jsonData.meta.image).toBe("Blink.png");
    expect(result.fileRecords).toEqual([
      { id: "uploaded-b.png" },
      { id: "uploaded-Blink.png" },
    ]);
  });

  it("refuses a sheet larger than the device can show", async () => {
    const { service, uploadFiles } = createService();

    await expect(
      service.buildSpritesheetFromFrames({
        frames: [
          { key: "a", name: "a", width: 5000, height: 10, url: "blob:a" },
        ],
        clips: [clip([{ key: "e1", frameKey: "a", hold: 1 }])],
        name: "Wide",
      }),
    ).rejects.toMatchObject({ code: "spritesheet_too_large", limit: 4096 });
    expect(uploadFiles).not.toHaveBeenCalled();
  });

  it("fails when a picture could not be saved", async () => {
    const { service, uploadFiles } = createService();
    uploadFiles.mockImplementationOnce(async () => []);

    await expect(
      service.buildSpritesheetFromFrames({
        frames: [
          {
            key: "a",
            name: "a",
            width: 16,
            height: 16,
            url: "blob:a",
            file: new File(["a"], "a.png"),
          },
        ],
        clips: [clip([{ key: "e1", frameKey: "a", hold: 1 }])],
        name: "Blink",
      }),
    ).rejects.toMatchObject({ code: "spritesheet_frames_upload_failed" });
  });

  it("cuts a saved sheet into one PNG per atlas frame", async () => {
    const { service, getFileContent } = createService();

    const frames = await service.extractSpritesheetFrames({
      fileId: "sheet-file",
      jsonData: {
        frames: {
          "walk_1.png": { frame: { x: 0, y: 0, w: 16, h: 16 } },
          walk_2: { frame: { x: 16, y: 0, w: 16, h: 16 } },
        },
      },
    });

    expect(getFileContent).toHaveBeenCalledWith("sheet-file");
    expect(frames.map((frame) => frame.name)).toEqual(["walk_1", "walk_2"]);
    expect(frames[0].file.name).toBe("walk_1.png");
    expect(frames[0].file.type).toBe("image/png");
    expect(frames[0]).toMatchObject({
      width: 16,
      height: 16,
      url: "blob:test",
    });
    // The cut pictures' sizes are known, so they are not decoded again.
    expect(readImageSizeFromUrl).not.toHaveBeenCalled();
  });

  it("keeps dots in frame names that are not a file extension", async () => {
    const { service } = createService();

    const frames = await service.extractSpritesheetFrames({
      fileId: "sheet-file",
      jsonData: {
        frames: {
          "walk.001": { frame: { x: 0, y: 0, w: 16, h: 16 } },
          "walk.002.png": { frame: { x: 16, y: 0, w: 16, h: 16 } },
        },
      },
    });

    expect(frames.map((frame) => frame.name)).toEqual(["walk.001", "walk.002"]);
  });

  it("loads saved frame pictures in their order", async () => {
    const { service, getFileContent } = createService();
    // Later files finish first.
    getFileContent.mockImplementation(async (fileId) => {
      await new Promise((resolve) =>
        setTimeout(resolve, fileId === "frame-0" ? 20 : 0),
      );
      return { url: `https://files.test/${fileId}`, revoke: vi.fn() };
    });

    const frames = await service.loadSpritesheetFrameFileIds({
      fileIds: ["frame-0", "frame-1", "frame-2"],
    });

    expect(frames.map((frame) => frame.fileId)).toEqual([
      "frame-0",
      "frame-1",
      "frame-2",
    ]);
  });

  it("frees the pictures it loaded when one cannot be read", async () => {
    const { service, getFileContent } = createService();
    getFileContent.mockImplementation(async (fileId) => {
      if (fileId === "frame-1") {
        throw new Error("missing file");
      }
      return { url: `https://files.test/${fileId}`, revoke: vi.fn() };
    });

    await expect(
      service.loadSpritesheetFrameFileIds({
        fileIds: ["frame-0", "frame-1"],
      }),
    ).rejects.toThrow("missing file");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  describe("combineSpritesheetSourceFiles", () => {
    const jsonFile = (atlas, name = "hero.json") =>
      new File([JSON.stringify(atlas)], name, { type: "application/json" });
    const pngFile = (name) => new File(["png"], name, { type: "image/png" });
    const splitAtlas = {
      textures: [
        {
          image: "hero-0.png",
          scale: 1,
          frames: [{ filename: "run/0", frame: { x: 0, y: 0, w: 8, h: 8 } }],
        },
        {
          image: "hero-1.png",
          scale: 1,
          frames: [{ filename: "run/1", frame: { x: 4, y: 2, w: 8, h: 8 } }],
        },
      ],
      meta: { app: "texture packer" },
    };

    it("keeps one PNG and its JSON as they are", async () => {
      renderSpritesheetImage.mockClear();
      const { service } = createService();
      const png = pngFile("hero.png");
      const atlasFile = jsonFile({ frames: {}, meta: { image: "hero.png" } });

      const result = await service.combineSpritesheetSourceFiles({
        pngFiles: [png],
        atlasFile,
      });

      expect(result).toEqual({ pngFile: png, atlasFile });
      expect(renderSpritesheetImage).not.toHaveBeenCalled();
    });

    it("merges a sheet split over several images into one PNG and JSON", async () => {
      const { service } = createService();
      readImageSizeFromUrl
        .mockResolvedValueOnce({ width: 64, height: 32 })
        .mockResolvedValueOnce({ width: 40, height: 48 });

      // Picked in any order; each image is matched by its file name.
      const result = await service.combineSpritesheetSourceFiles({
        pngFiles: [pngFile("hero-1.png"), pngFile("HERO-0.png")],
        atlasFile: jsonFile(splitAtlas),
      });

      expect(renderSpritesheetImage).toHaveBeenCalledWith(
        expect.objectContaining({
          sheetWidth: 106,
          sheetHeight: 48,
          placements: [
            { x: 0, y: 0, width: 64, height: 32 },
            { x: 66, y: 0, width: 40, height: 48 },
          ],
        }),
      );
      expect(result.pngFile.name).toBe("hero.png");
      const atlas = JSON.parse(await result.atlasFile.text());
      expect(
        atlas.frames.map((frame) => [frame.filename, frame.frame]),
      ).toEqual([
        ["run/0", { x: 0, y: 0, w: 8, h: 8 }],
        ["run/1", { x: 70, y: 2, w: 8, h: 8 }],
      ]);
      expect(atlas.meta).toEqual({
        app: "texture packer",
        image: "hero.png",
        size: { w: 106, h: 48 },
        scale: 1,
      });
    });

    it("asks for every image the JSON uses", async () => {
      const { service } = createService();

      await expect(
        service.combineSpritesheetSourceFiles({
          pngFiles: [pngFile("hero-0.png")],
          atlasFile: jsonFile(splitAtlas),
        }),
      ).rejects.toMatchObject({
        code: "spritesheet_images_missing",
        missingImages: ["hero-1.png"],
      });
    });

    it("refuses images that together are larger than the device can show", async () => {
      renderSpritesheetImage.mockClear();
      const { service } = createService();
      readImageSizeFromUrl
        .mockResolvedValueOnce({ width: 4000, height: 4000 })
        .mockResolvedValueOnce({ width: 4000, height: 4000 });

      await expect(
        service.combineSpritesheetSourceFiles({
          pngFiles: [pngFile("hero-0.png"), pngFile("hero-1.png")],
          atlasFile: jsonFile(splitAtlas),
        }),
      ).rejects.toMatchObject({ code: "spritesheet_too_large", limit: 4096 });
      expect(renderSpritesheetImage).not.toHaveBeenCalled();
    });
  });
});
