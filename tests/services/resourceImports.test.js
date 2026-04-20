import { describe, expect, it, vi } from "vitest";
import {
  buildImageResourceDataFromUploadResult,
  buildImageResourcePatchFromUploadResult,
  buildSoundResourceDataFromUploadResult,
  buildSoundResourcePatchFromUploadResult,
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
      width: 640,
      height: 360,
    });
  });

  it("maps upload results to image resource patches without duplicated file metadata", () => {
    expect(
      buildImageResourcePatchFromUploadResult({
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
      fileId: "file-1",
      thumbnailFileId: "thumb-1",
      name: "Image One",
      width: 640,
      height: 360,
    });
  });

  it("maps upload results to sound resource data without duplicated file metadata", () => {
    expect(
      buildSoundResourceDataFromUploadResult({
        fileId: "file-1",
        displayName: "Theme",
        file: {
          type: "audio/ogg",
          size: 123,
        },
        waveformDataFileId: "wave-1",
        duration: 12.5,
      }),
    ).toEqual({
      type: "sound",
      fileId: "file-1",
      name: "Theme",
      description: "",
      waveformDataFileId: "wave-1",
      duration: 12.5,
    });
  });

  it("maps upload results to sound resource patches without duplicated file metadata", () => {
    expect(
      buildSoundResourcePatchFromUploadResult({
        fileId: "file-1",
        file: {
          type: "audio/ogg",
          size: 123,
        },
        waveformDataFileId: "wave-1",
        duration: 12.5,
      }),
    ).toEqual({
      fileId: "file-1",
      waveformDataFileId: "wave-1",
      duration: 12.5,
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
