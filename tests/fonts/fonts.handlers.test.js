import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateIdMock, processPendingUploadsMock } = vi.hoisted(() => ({
  generateIdMock: vi.fn(() => "font-123"),
  processPendingUploadsMock: vi.fn(),
}));

vi.mock("../../src/internal/id.js", () => ({
  generateId: generateIdMock,
}));

vi.mock(
  "../../src/internal/ui/resourcePages/media/processPendingUploads.js",
  () => ({
    processPendingUploads: processPendingUploadsMock,
  }),
);

import {
  handleDataChanged,
  handleUploadClick,
} from "../../src/pages/fonts/fonts.handlers.js";

describe("fonts handlers", () => {
  beforeEach(() => {
    generateIdMock.mockClear();
    processPendingUploadsMock.mockReset();
  });

  it("hydrates font file metadata from repository files on refresh", async () => {
    const repositoryState = {
      files: {
        tree: [],
        items: {
          "file-1": {
            id: "file-1",
            mimeType: "font/woff2",
            size: 2048,
          },
        },
      },
      fonts: {
        tree: [{ id: "font-1" }],
        items: {
          "font-1": {
            id: "font-1",
            type: "font",
            name: "Inter",
            fileId: "file-1",
          },
        },
      },
    };
    const deps = {
      projectService: {
        getState: () => repositoryState,
      },
      store: {
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
      render: vi.fn(),
    };

    await handleDataChanged(deps);

    expect(deps.store.setItems).toHaveBeenCalledWith({
      data: {
        tree: [{ id: "font-1" }],
        items: {
          "font-1": {
            id: "font-1",
            type: "font",
            name: "Inter",
            fileId: "file-1",
            fileType: "font/woff2",
            fileSize: 2048,
            resolvedTags: [],
          },
        },
      },
    });
  });

  it("marks pending uploads with the created font id before creating", async () => {
    const file = new File(["font"], "inter.ttf", {
      type: "font/ttf",
    });
    const uploadResult = {
      fileId: "file-1",
      fileRecords: [{ id: "file-1" }],
      displayName: "Inter",
      fontName: "Inter",
      fileName: "inter.ttf",
      fileSize: 2048,
      fileType: "font/ttf",
    };
    const removePendingUpload = vi.fn();
    processPendingUploadsMock.mockImplementation(
      async ({ files, processFile }) => {
        await processFile({
          file: files[0],
          pendingUploadId: "pending-font-1",
          removePendingUpload,
        });
        return { status: "ok", successfulUploadCount: 1 };
      },
    );

    const deps = {
      appService: {
        pickFiles: vi.fn(async () => [file]),
        showAlert: vi.fn(),
      },
      projectService: {
        uploadFiles: vi.fn(async () => [uploadResult]),
        createFont: vi.fn(async () => ({ valid: true })),
        getState: vi.fn(() => ({
          fonts: {
            tree: [],
            items: {
              "font-123": {
                id: "font-123",
                type: "font",
                name: "Inter",
                fileId: "file-1",
              },
            },
          },
          files: {
            tree: [],
            items: {},
          },
        })),
        subscribeProjectState: vi.fn(() => () => {}),
      },
      store: {
        updatePendingUpload: vi.fn(),
        setTagsData: vi.fn(),
        setItems: vi.fn(),
        setSelectedItemId: vi.fn(),
      },
      render: vi.fn(),
      refs: {
        fileExplorer: {
          selectItem: vi.fn(),
        },
      },
    };

    await handleUploadClick(deps, {
      _event: {
        detail: {
          groupId: "folder-1",
        },
      },
    });

    expect(deps.store.updatePendingUpload).toHaveBeenCalledWith({
      itemId: "pending-font-1",
      updates: {
        resolvedItemId: "font-123",
      },
    });
    expect(deps.projectService.createFont).toHaveBeenCalledWith({
      fontId: "font-123",
      fileRecords: uploadResult.fileRecords,
      data: expect.objectContaining({
        type: "font",
        name: "Inter",
        fileId: "file-1",
        fontFamily: "Inter",
      }),
      parentId: "folder-1",
      position: "last",
    });
    expect(removePendingUpload).toHaveBeenCalledTimes(1);
  });
});
