import { describe, expect, it, vi } from "vitest";
import { processPendingUploads } from "../../src/internal/ui/resourcePages/media/processPendingUploads.js";

const createDeps = () => ({
  projectService: {
    uploadFiles: vi.fn(async ([file]) => [
      {
        fileId: `file-${file.name}`,
        fileRecords: [{ id: `file-${file.name}` }],
      },
    ]),
  },
  store: {
    addPendingUploads: vi.fn(),
    removePendingUploads: vi.fn(),
  },
  render: vi.fn(),
});

describe("processPendingUploads", () => {
  it("refreshes once after a batch completes in upload/create mode", async () => {
    const deps = createDeps();
    const refresh = vi.fn(async () => {});
    const createItem = vi.fn(async () => true);

    await processPendingUploads({
      deps,
      files: [{ name: "first.png" }, { name: "second.png" }],
      parentId: "folder-1",
      pendingIdPrefix: "pending-image",
      refresh,
      createItem,
    });

    expect(deps.projectService.uploadFiles).toHaveBeenCalledTimes(2);
    expect(createItem).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("refreshes once per successful file in direct process mode", async () => {
    const deps = createDeps();
    const refresh = vi.fn(async () => {});
    const processFile = vi.fn(async () => true);

    await processPendingUploads({
      deps,
      files: [{ name: "first.png" }, { name: "second.png" }],
      parentId: "folder-1",
      pendingIdPrefix: "pending-image",
      refresh,
      processFile,
    });

    expect(processFile).toHaveBeenCalledTimes(2);
    expect(deps.projectService.uploadFiles).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("does not remove the same pending upload twice when processFile clears it early", async () => {
    const deps = createDeps();
    const refresh = vi.fn(async () => {});
    const seenPendingUploadIds = [];
    const processFile = vi.fn(
      async ({ pendingUploadId, removePendingUpload }) => {
        seenPendingUploadIds.push(pendingUploadId);
        removePendingUpload();
        return true;
      },
    );

    await processPendingUploads({
      deps,
      files: [{ name: "first.wav" }],
      parentId: "folder-1",
      pendingIdPrefix: "pending-sound",
      refresh,
      processFile,
    });

    expect(processFile).toHaveBeenCalledTimes(1);
    expect(deps.store.removePendingUploads).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(seenPendingUploadIds).toEqual(
      expect.arrayContaining([expect.any(String)]),
    );
  });
});
