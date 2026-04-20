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
});
