import { describe, expect, it, vi } from "vitest";
import { processPendingUploads } from "../../src/internal/ui/resourcePages/media/processPendingUploads.js";
import { createAppShellService } from "../../src/deps/services/shared/appShellService.js";

const createAppService = (
  router = { getPayload: () => ({ p: "project-1" }) },
) => {
  const progressDialog = { close: vi.fn() };
  return Object.assign(
    createAppShellService({ router, subject: { dispatch: vi.fn() } }),
    { progressDialog, showProgressDialog: vi.fn(() => progressDialog) },
  );
};

const i18n = {
  resourcePages: {
    finishingUploadsTitle: "Finishing uploads…",
    finishingUploadsMessage: "Please wait while your files finish uploading.",
  },
};

const createDeps = () => ({
  i18n,
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

  it("stops waiting for uploads that never finish", async () => {
    vi.useFakeTimers();
    try {
      const appService = createAppService();
      const processFile = vi.fn(() => new Promise(() => {}));
      void processPendingUploads({
        deps: { ...createDeps(), appService },
        files: [{ name: "stuck.png" }],
        parentId: "folder-1",
        pendingIdPrefix: "pending-image",
        processFile,
        onUploadError: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(processFile).toHaveBeenCalledOnce();

      let leftProject = false;
      const leaveProject = appService
        .prepareNavigation({ path: "/projects", payload: undefined })
        .then(() => {
          leftProject = true;
        });
      await vi.advanceTimersByTimeAsync(119_999);
      expect(leftProject).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await leaveProject;
      expect(leftProject).toBe(true);
      expect(appService.showProgressDialog).toHaveBeenCalledOnce();
      expect(appService.progressDialog.close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  describe("message while leaving waits", () => {
    const startUploads = (appService, processFile) =>
      processPendingUploads({
        deps: { ...createDeps(), appService },
        files: [{ name: "first.png" }],
        parentId: "folder-1",
        pendingIdPrefix: "pending-image",
        processFile,
        onUploadError: vi.fn(),
      });

    const startWithPendingStore = async (appService) => {
      let finishStoring;
      const processFile = vi.fn(
        () =>
          new Promise((resolve) => {
            finishStoring = () => resolve(true);
          }),
      );
      const uploads = startUploads(appService, processFile);
      await vi.advanceTimersByTimeAsync(0);
      expect(processFile).toHaveBeenCalledOnce();
      return { uploads, finishStoring: () => finishStoring() };
    };

    it("tells the user once the wait is noticeable and closes the message when it ends", async () => {
      vi.useFakeTimers();
      try {
        const appService = createAppService();
        const { uploads, finishStoring } =
          await startWithPendingStore(appService);

        let closedBeforeLeaving = false;
        const leaveProject = appService
          .prepareNavigation({ path: "/projects", payload: undefined })
          .then(() => {
            closedBeforeLeaving =
              appService.progressDialog.close.mock.calls.length === 1;
          });
        await vi.advanceTimersByTimeAsync(299);
        expect(appService.showProgressDialog).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(appService.showProgressDialog).toHaveBeenCalledWith({
          title: "Finishing uploads…",
          message: "Please wait while your files finish uploading.",
          progress: {},
        });

        // Another attempt to leave shares the same message.
        const leaveAgain = appService.prepareNavigation({
          path: "/projects",
          payload: undefined,
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(appService.showProgressDialog).toHaveBeenCalledOnce();
        expect(appService.progressDialog.close).not.toHaveBeenCalled();

        finishStoring();
        await uploads;
        await Promise.all([leaveProject, leaveAgain]);
        expect(appService.progressDialog.close).toHaveBeenCalledOnce();
        expect(closedBeforeLeaving).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows no message when the uploads finish quickly", async () => {
      vi.useFakeTimers();
      try {
        const appService = createAppService();
        const { uploads, finishStoring } =
          await startWithPendingStore(appService);

        const leaveProject = appService.prepareNavigation({
          path: "/projects",
          payload: undefined,
        });
        await vi.advanceTimersByTimeAsync(100);
        finishStoring();
        await uploads;
        await leaveProject;
        await vi.advanceTimersByTimeAsync(1000);

        expect(appService.showProgressDialog).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("shows no message when moving to another page of the project", async () => {
      vi.useFakeTimers();
      try {
        const appService = createAppService();
        const { uploads, finishStoring } =
          await startWithPendingStore(appService);

        await appService.prepareNavigation({
          path: "/project/sounds",
          payload: { p: "project-1" },
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(appService.showProgressDialog).not.toHaveBeenCalled();

        finishStoring();
        await uploads;
      } finally {
        vi.useRealTimers();
      }
    });
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
