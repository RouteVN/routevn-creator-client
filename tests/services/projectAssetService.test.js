import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  detectFileType: vi.fn(),
  getImageDimensions: vi.fn(),
  extractImageThumbnail: vi.fn(),
  getVideoDimensions: vi.fn(),
  extractVideoThumbnail: vi.fn(),
}));

vi.mock("../../src/deps/clients/web/fileProcessors.js", () => ({
  detectFileType: mocked.detectFileType,
  getImageDimensions: mocked.getImageDimensions,
  extractImageThumbnail: mocked.extractImageThumbnail,
  getVideoDimensions: mocked.getVideoDimensions,
  extractWaveformDataFromArrayBuffer: vi.fn(),
  extractVideoThumbnail: mocked.extractVideoThumbnail,
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

  it("tracks a stored import blob when image decoding fails before staging returns", async () => {
    const deleteStoredFiles = vi.fn(async () => {});
    let projectReference = {
      projectId: "project-one",
      repositoryProjectId: "project-one",
    };
    mocked.detectFileType.mockReturnValue("image");
    mocked.getImageDimensions.mockRejectedValue(new Error("invalid image"));
    const service = createProjectAssetService({
      idGenerator: () => "generated-id",
      fileAdapter: {
        storeFile: vi.fn(async () => ({ fileId: "file-original" })),
        deleteStoredFiles,
        getFileContent: vi.fn(),
        getFileByProjectId: vi.fn(),
      },
      getCurrentStore: vi.fn(),
      getCurrentReference: () => projectReference,
      getStoreByProject: vi.fn(),
    });

    await expect(
      service.stageResourceImportFile({
        planId: "plan-one",
        file: new File(["invalid"], "image.png", { type: "image/png" }),
        fileId: "file-original",
        thumbnailFileId: "file-thumbnail",
        processImage: true,
      }),
    ).rejects.toThrow("invalid image");
    projectReference = {
      projectId: "project-two",
      repositoryProjectId: "project-two",
    };
    await service.discardResourceImportFiles({ planId: "plan-one" });

    expect(deleteStoredFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        fileIds: ["file-original"],
        projectReference: {
          projectId: "project-one",
          repositoryProjectId: "project-one",
        },
      }),
    );
  });

  it("returns the required thumbnail file for video uploads", async () => {
    let storedCount = 0;
    mocked.detectFileType.mockReturnValue("video");
    mocked.getVideoDimensions.mockResolvedValue({
      width: 1920,
      height: 1080,
      duration: 10,
    });
    mocked.extractVideoThumbnail.mockResolvedValue({
      blob: new Blob(["thumbnail-bytes"], { type: "image/jpeg" }),
    });
    const service = createProjectAssetService({
      idGenerator: () => "generated-id",
      fileAdapter: {
        continueOnUploadError: false,
        storeFile: vi.fn(async () => {
          storedCount += 1;
          return { fileId: `file-${storedCount}` };
        }),
        getFileContent: vi.fn(),
        getFileByProjectId: vi.fn(),
      },
      getCurrentStore: vi.fn(),
      getCurrentReference: vi.fn(),
      getStoreByProject: vi.fn(),
    });

    const result = await service.uploadFiles([
      new File(["video-bytes"], "opening.mp4", { type: "video/mp4" }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        fileId: "file-1",
        thumbnailFileId: "file-2",
        dimensions: {
          width: 1920,
          height: 1080,
        },
        duration: 10,
        fileRecords: [
          expect.objectContaining({
            id: "file-1",
            mimeType: "video/mp4",
          }),
          expect.objectContaining({
            id: "file-2",
            mimeType: "image/jpeg",
          }),
        ],
      }),
    ]);
  });

  it("rejects video uploads when a required thumbnail cannot be generated", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const storeFile = vi.fn(async () => ({ fileId: "file-video" }));
    mocked.detectFileType.mockReturnValue("video");
    mocked.getVideoDimensions.mockResolvedValue({
      width: 1920,
      height: 1080,
      duration: 10,
    });
    mocked.extractVideoThumbnail.mockRejectedValue(
      new Error("thumbnail timed out"),
    );
    const service = createProjectAssetService({
      idGenerator: () => "generated-id",
      fileAdapter: {
        continueOnUploadError: false,
        storeFile,
        getFileContent: vi.fn(),
        getFileByProjectId: vi.fn(),
      },
      getCurrentStore: vi.fn(),
      getCurrentReference: vi.fn(),
      getStoreByProject: vi.fn(),
    });

    await expect(
      service.uploadFiles([
        new File(["video-bytes"], "opening.mp4", { type: "video/mp4" }),
      ]),
    ).rejects.toThrow("thumbnail timed out");
    expect(consoleWarn).toHaveBeenCalledWith(
      "[videoUpload] thumbnail.failed",
      expect.objectContaining({
        error: "thumbnail timed out",
      }),
    );
    expect(storeFile).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
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
