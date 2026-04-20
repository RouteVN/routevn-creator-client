import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  detectFileType: vi.fn(),
  getImageDimensions: vi.fn(),
  extractImageThumbnail: vi.fn(),
}));

vi.mock("../../src/deps/clients/web/fileProcessors.js", () => ({
  detectFileType: mocked.detectFileType,
  getImageDimensions: mocked.getImageDimensions,
  extractImageThumbnail: mocked.extractImageThumbnail,
  getVideoDimensions: vi.fn(),
  extractWaveformDataFromArrayBuffer: vi.fn(),
  extractVideoThumbnail: vi.fn(),
}));

import { createProjectAssetService } from "../../src/deps/services/shared/projectAssetService.js";

describe("projectAssetService", () => {
  it("can skip thumbnail generation for image uploads through the shared upload path", async () => {
    let storedCount = 0;
    const storeFile = vi.fn(async () => {
      storedCount += 1;
      return { fileId: `file-${storedCount}` };
    });
    mocked.detectFileType.mockReturnValue("image");
    mocked.getImageDimensions.mockResolvedValue({
      width: 320,
      height: 240,
    });
    mocked.extractImageThumbnail.mockResolvedValue({
      blob: new Blob(["thumb"], { type: "image/webp" }),
    });

    const service = createProjectAssetService({
      idGenerator: () => "generated-id",
      fileAdapter: {
        storeFile,
        getFileContent: vi.fn(),
        getFileByProjectId: vi.fn(),
      },
      getCurrentStore: vi.fn(),
      getCurrentReference: vi.fn(),
      getStoreByProject: vi.fn(),
    });

    const result = await service.uploadFiles(
      [new File(["image-bytes"], "avatar.png", { type: "image/png" })],
      {
        skipImageThumbnail: true,
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      fileId: "file-1",
      type: "image",
      fileRecords: [
        expect.objectContaining({
          id: "file-1",
          mimeType: "image/png",
        }),
      ],
    });
    expect(result[0]).not.toHaveProperty("thumbnailFileId");
    expect(storeFile).toHaveBeenCalledTimes(1);
    expect(mocked.extractImageThumbnail).not.toHaveBeenCalled();
  });

  it("delegates getFileByProjectId through the stable file-adapter contract", async () => {
    const fileBlob = new Blob(["icon"], { type: "image/png" });
    const getStoreByProject = vi.fn();
    const getFileByProjectId = vi.fn(async () => fileBlob);
    const service = createProjectAssetService({
      idGenerator: () => "generated-id",
      fileAdapter: {
        storeFile: vi.fn(),
        getFileContent: vi.fn(),
        getFileByProjectId,
      },
      getCurrentStore: vi.fn(),
      getCurrentReference: vi.fn(),
      getStoreByProject,
    });

    await expect(
      service.getFileByProjectId("project-1", "file-1"),
    ).resolves.toBe(fileBlob);
    expect(getFileByProjectId).toHaveBeenCalledWith({
      projectId: "project-1",
      fileId: "file-1",
      getStoreByProject,
    });
  });

  it("normalizes font mime types into file records", async () => {
    let storedCount = 0;
    const storeFile = vi.fn(async () => {
      storedCount += 1;
      return { fileId: `file-${storedCount}` };
    });
    mocked.detectFileType.mockReturnValue("font");

    const service = createProjectAssetService({
      idGenerator: () => "generated-id",
      fileAdapter: {
        storeFile,
        getFileContent: vi.fn(),
        getFileByProjectId: vi.fn(),
      },
      getCurrentStore: vi.fn(),
      getCurrentReference: vi.fn(),
      getStoreByProject: vi.fn(),
    });

    const result = await service.storeFile({
      file: new File([new Uint8Array([0x00, 0x01, 0x00, 0x00])], "font.ttf", {
        type: "",
      }),
    });

    expect(result.fileRecords).toEqual([
      expect.objectContaining({
        id: "file-1",
        mimeType: "font/ttf",
      }),
    ]);
  });
});
