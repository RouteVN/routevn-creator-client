import { describe, expect, it, vi } from "vitest";
import {
  buildImageResourceDataFromUploadResult,
  importImageFile,
} from "../../src/deps/services/shared/resourceImports.js";

describe("resource image imports", () => {
  it("maps upload results to image resource data", () => {
    expect(
      buildImageResourceDataFromUploadResult({
        fileId: "file-1",
        thumbnailFileId: "thumb-1",
        displayName: "Image One",
        file: {
          type: "image/png",
          size: 123,
        },
        dimensions: {
          width: 640,
          height: 360,
        },
      }),
    ).toEqual({
      type: "image",
      fileId: "file-1",
      thumbnailFileId: "thumb-1",
      name: "Image One",
      fileType: "image/png",
      fileSize: 123,
      width: 640,
      height: 360,
    });
  });

  it("imports one image file through the upload and create contracts", async () => {
    const file = { name: "scene.png" };
    const uploadFiles = vi.fn(async () => [
      {
        fileId: "file-1",
        thumbnailFileId: "thumb-1",
        displayName: "Scene",
        fileRecords: [{ id: "file-1" }, { id: "thumb-1" }],
        file: {
          type: "image/png",
          size: 456,
        },
        dimensions: {
          width: 800,
          height: 600,
        },
      },
    ]);
    const createImage = vi.fn(async () => "image-1");

    const result = await importImageFile({
      file,
      parentId: "folder-1",
      uploadFiles,
      createImage,
    });

    expect(result).toEqual({
      valid: true,
      imageId: "image-1",
      uploadResult: {
        fileId: "file-1",
        thumbnailFileId: "thumb-1",
        displayName: "Scene",
        fileRecords: [{ id: "file-1" }, { id: "thumb-1" }],
        file: {
          type: "image/png",
          size: 456,
        },
        dimensions: {
          width: 800,
          height: 600,
        },
      },
    });
    expect(uploadFiles).toHaveBeenCalledWith([file]);
    expect(createImage).toHaveBeenCalledWith({
      data: {
        type: "image",
        fileId: "file-1",
        thumbnailFileId: "thumb-1",
        name: "Scene",
        fileType: "image/png",
        fileSize: 456,
        width: 800,
        height: 600,
      },
      fileRecords: [{ id: "file-1" }, { id: "thumb-1" }],
      parentId: "folder-1",
      position: "last",
    });
  });

  it("returns a structured failure when upload yields no file", async () => {
    const result = await importImageFile({
      file: { name: "missing.png" },
      parentId: "folder-1",
      uploadFiles: vi.fn(async () => []),
      createImage: vi.fn(),
    });

    expect(result).toEqual({
      valid: false,
      error: {
        code: "upload_failed",
        message: "Failed to upload image.",
      },
    });
  });
});
