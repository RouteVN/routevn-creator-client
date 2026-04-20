import { describe, expect, it } from "vitest";
import {
  withResolvedCollectionFileMetadata,
  withResolvedResourceFileMetadata,
} from "../../src/internal/resourceFileMetadata.js";

describe("resourceFileMetadata", () => {
  it("prefers file record metadata over stale resource fields", () => {
    expect(
      withResolvedResourceFileMetadata({
        item: {
          id: "image-1",
          type: "image",
          fileId: "file-1",
          fileType: "image/png",
          fileSize: 100,
        },
        files: {
          items: {
            "file-1": {
              id: "file-1",
              mimeType: "image/jpeg",
              size: 250,
            },
          },
        },
      }),
    ).toEqual({
      id: "image-1",
      type: "image",
      fileId: "file-1",
      fileType: "image/jpeg",
      fileSize: 250,
    });
  });

  it("removes stale resource metadata when no file record exists", () => {
    expect(
      withResolvedResourceFileMetadata({
        item: {
          id: "sound-1",
          type: "sound",
          fileId: "missing-file",
          fileType: "audio/mpeg",
          fileSize: 2048,
        },
        files: {
          items: {},
        },
      }),
    ).toEqual({
      id: "sound-1",
      type: "sound",
      fileId: "missing-file",
    });
  });

  it("preserves existing resource metadata when file records are unavailable", () => {
    expect(
      withResolvedResourceFileMetadata({
        item: {
          id: "video-1",
          type: "video",
          fileId: "file-1",
          fileType: "video/mp4",
          fileSize: 2048,
        },
      }),
    ).toEqual({
      id: "video-1",
      type: "video",
      fileId: "file-1",
      fileType: "video/mp4",
      fileSize: 2048,
    });
  });

  it("leaves unsupported resource types unchanged", () => {
    expect(
      withResolvedResourceFileMetadata({
        item: {
          id: "text-style-1",
          type: "textStyle",
          fileId: "file-1",
          fileType: "text/plain",
          fileSize: 12,
        },
        files: {
          items: {
            "file-1": {
              id: "file-1",
              mimeType: "application/json",
              size: 128,
            },
          },
        },
      }),
    ).toEqual({
      id: "text-style-1",
      type: "textStyle",
      fileId: "file-1",
      fileType: "text/plain",
      fileSize: 12,
    });
  });

  it("normalizes supported collection items while leaving folders unchanged", () => {
    expect(
      withResolvedCollectionFileMetadata({
        collection: {
          tree: [{ id: "folder-1" }, { id: "sound-1" }],
          items: {
            "folder-1": {
              id: "folder-1",
              type: "folder",
              name: "Folder",
            },
            "sound-1": {
              id: "sound-1",
              type: "sound",
              fileId: "file-1",
              name: "Theme",
            },
          },
        },
        files: {
          items: {
            "file-1": {
              id: "file-1",
              mimeType: "audio/ogg",
              size: 4096,
            },
          },
        },
        resourceTypes: ["sound"],
      }),
    ).toEqual({
      tree: [{ id: "folder-1" }, { id: "sound-1" }],
      items: {
        "folder-1": {
          id: "folder-1",
          type: "folder",
          name: "Folder",
        },
        "sound-1": {
          id: "sound-1",
          type: "sound",
          fileId: "file-1",
          name: "Theme",
          fileType: "audio/ogg",
          fileSize: 4096,
        },
      },
    });
  });

  it("normalizes video, font, and spritesheet items from file records", () => {
    expect(
      withResolvedCollectionFileMetadata({
        collection: {
          tree: [{ id: "video-1" }, { id: "font-1" }, { id: "sheet-1" }],
          items: {
            "video-1": {
              id: "video-1",
              type: "video",
              fileId: "file-video-1",
            },
            "font-1": {
              id: "font-1",
              type: "font",
              fileId: "file-font-1",
            },
            "sheet-1": {
              id: "sheet-1",
              type: "spritesheet",
              fileId: "file-sheet-1",
            },
          },
        },
        files: {
          items: {
            "file-video-1": {
              id: "file-video-1",
              mimeType: "video/mp4",
              size: 1024,
            },
            "file-font-1": {
              id: "file-font-1",
              mimeType: "font/woff2",
              size: 2048,
            },
            "file-sheet-1": {
              id: "file-sheet-1",
              mimeType: "image/png",
              size: 4096,
            },
          },
        },
      }),
    ).toEqual({
      tree: [{ id: "video-1" }, { id: "font-1" }, { id: "sheet-1" }],
      items: {
        "video-1": {
          id: "video-1",
          type: "video",
          fileId: "file-video-1",
          fileType: "video/mp4",
          fileSize: 1024,
        },
        "font-1": {
          id: "font-1",
          type: "font",
          fileId: "file-font-1",
          fileType: "font/woff2",
          fileSize: 2048,
        },
        "sheet-1": {
          id: "sheet-1",
          type: "spritesheet",
          fileId: "file-sheet-1",
          fileType: "image/png",
          fileSize: 4096,
        },
      },
    });
  });
});
