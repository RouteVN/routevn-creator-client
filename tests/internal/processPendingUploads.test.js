import { describe, expect, it, vi } from "vitest";
import { processPendingUploads } from "../../src/internal/ui/resourcePages/media/processPendingUploads.js";
import { createAppShellService } from "../../src/deps/services/shared/appShellService.js";

const createAppService = (
  router = { getPayload: () => ({ p: "project-1" }) },
) => createAppShellService({ router, subject: { dispatch: vi.fn() } });

const createDeps = () => ({
  appService: createAppService(),
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

  it("leaves the project only after the uploads stored in it finish", async () => {
    let routePayload = { p: "project-1" };
    const appService = createAppService({ getPayload: () => routePayload });
    let finishStoring;
    const storing = new Promise((resolve) => {
      finishStoring = resolve;
    });
    const onUploadError = vi.fn();
    const processFile = vi.fn(async () => {
      await storing;
      // Like the project service, storing needs the project in the route.
      if (routePayload.p !== "project-1") {
        throw new Error(
          "Project reference not initialized. Call ensureRepository() first.",
        );
      }
      return true;
    });
    const deps = { ...createDeps(), appService };

    const uploads = processPendingUploads({
      deps,
      files: [{ name: "first.png" }],
      parentId: "folder-1",
      pendingIdPrefix: "pending-image",
      processFile,
      onUploadError,
    });
    await vi.waitFor(() => expect(processFile).toHaveBeenCalledOnce());

    // Like a route transition, the route changes once navigation is prepared.
    let leftProject = false;
    const leaveProject = appService
      .prepareNavigation({ path: "/projects", payload: undefined })
      .then(() => {
        routePayload = {};
        leftProject = true;
      });
    await appService.prepareNavigation({
      path: "/project/sounds",
      payload: { p: "project-1" },
    });
    await appService.prepareNavigation({ reason: "background" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(leftProject).toBe(false);

    finishStoring();
    await expect(uploads).resolves.toEqual({
      status: "ok",
      successfulUploadCount: 1,
    });
    await leaveProject;

    expect(onUploadError).not.toHaveBeenCalled();
    expect(leftProject).toBe(true);
  });
});
