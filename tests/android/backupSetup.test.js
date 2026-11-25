import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, it, expect, vi } from "vitest";
import * as actions from "../../src/pages/projectFolderSetup/projectFolderSetup.store.js";
import * as handlers from "../../src/pages/projectFolderSetup/projectFolderSetup.handlers.js";
import * as backupStatusStore from "../../src/components/android-backup-status/android-backup-status.store.js";
import * as backupStatusHandlers from "../../src/components/android-backup-status/android-backup-status.handlers.js";

const { selectViewData } = backupStatusStore;
const i18n = yaml.load(
  readFileSync(new URL("../../src/i18n/en.yaml", import.meta.url), "utf8"),
);
const fixture = () => {
  const state = actions.createInitialState();
  const store = Object.fromEntries(
    Object.entries(actions).map(([key, fn]) => [
      key,
      (payload) => fn({ state, i18n }, payload),
    ]),
  );
  const appService = {
    getProjectFolderSetup: () => ({ isBackup: true, configured: false }),
    showDialog: vi.fn(async () => false),
    disableBackup: vi.fn(async () => {}),
    navigate: vi.fn(),
    getPayload: vi.fn(() => ({})),
    canGoBack: vi.fn(() => true),
    back: vi.fn(),
    showToast: vi.fn(),
    pickProjectFolderSetup: vi.fn(async () => undefined),
    confirmProjectFolderSetup: vi.fn(async () => ({
      needsExistingConfirmation: true,
    })),
  };
  const deps = { store, state, i18n, appService, render: vi.fn() };
  handlers.handleBeforeMount(deps);
  return deps;
};
describe("Android backup setup", () => {
  it("requires confirmation to stop backups and preserves setup on cancellation or failure", async () => {
    const deps = fixture();
    const folder = { uri: "content://test", displayPath: "/Backups" };
    deps.store.setSavedFolder({ folder });
    handlers.handleStop(deps);
    expect(deps.state.stopDialogOpen).toBe(true);
    expect(deps.store.selectCopy().stopWarning).toContain("ALL PROJECTS");
    expect(deps.store.selectCopy().stopWarning).toContain(
      "Existing backups will remain",
    );
    handlers.handleCloseStop(deps);
    expect(deps.appService.disableBackup).not.toHaveBeenCalled();
    expect(deps.state.savedFolder).toEqual(folder);
    deps.appService.disableBackup.mockRejectedValueOnce(new Error("failed"));
    handlers.handleStop(deps);
    await handlers.handleConfirmStop(deps);
    expect(deps.state.savedFolder).toEqual(folder);
    expect(deps.appService.navigate).not.toHaveBeenCalled();
    expect(deps.appService.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        message: i18n.androidBackupSetup.stopError,
      }),
    );
    handlers.handleStop(deps);
    await handlers.handleConfirmStop(deps);
    expect(deps.state.savedFolder).toBeUndefined();
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/projects",
      undefined,
      { historyMode: "replace" },
    );
  });

  it("keeps Projects errors summarized and Config details scoped to the selected project", () => {
    const status = {
      configured: true,
      folder: { displayPath: "Documents/RouteVN Backups" },
      projects: Array.from({ length: 50 }, (_, index) => ({
        id: `project-${index}`,
        name: `Project ${index + 1}`,
        error: "lowSpace",
        backupFolderPath: `/Backups/Project-${index}`,
        snapshotAt: "2026-09-17T12:00:00.000Z",
      })),
    };
    const state = { status, currentProjectId: "project-3" };
    const summary = selectViewData({ state, props: { settings: false }, i18n });
    expect(summary.title).toBe("Backups need attention");
    expect(summary.message).toContain("1 GB");
    expect(summary.problemProject).toBe("Project 1");
    expect(summary.tone).toBe("warning");
    expect(summary.tryAgain).toBe(true);
    expect(summary.folder).toBe("Documents/RouteVN Backups");

    const settings = selectViewData({ state, props: { settings: true }, i18n });
    expect(settings.message).toContain("1 GB");
    expect(settings.folder).toBe("/Backups/Project-3");
    expect(settings.lastBackup).toMatch(/^Last backup: Sep 17, 2026/);
  });

  it("asks for the folder again when it stops every project", () => {
    const status = {
      configured: true,
      folder: { displayPath: "Documents/RouteVN Backups" },
      projects: [
        { id: "one", name: "Project One", error: "reconnect" },
        { id: "two", name: "Project Two", error: "" },
      ],
    };
    const state = { status, currentProjectId: "one" };
    const summary = selectViewData({ state, props: { settings: false }, i18n });
    expect(summary.chooseFolderAgain).toBe(true);
    expect(summary.tryAgain).toBe(false);
    expect(summary.problemProject).toBe("");
    const settings = selectViewData({ state, props: { settings: true }, i18n });
    expect(settings.chooseFolderAgain).toBe(true);
  });

  it("shows which project is backing up and how many files are copied", () => {
    const status = {
      configured: true,
      running: true,
      progress: { projectId: "one", name: "Project One", done: 12, total: 80 },
      projects: [
        { id: "one", name: "Project One", pending: true },
        { id: "two", name: "Project Two", pending: true },
      ],
    };
    const summary = selectViewData({
      state: { status },
      props: { settings: false },
      i18n,
    });
    expect(summary.title).toBe("Backing up…");
    expect(summary.message).toBe("Backing up Project One…");
    expect(summary.detail).toBe("Copying files: 12 of 80");
    expect(summary.backUpDisabled).toBe(true);

    const other = selectViewData({
      state: { status, currentProjectId: "two" },
      props: { settings: true },
      i18n,
    });
    expect(other.message).toBe(
      "New changes are backed up shortly after you stop editing.",
    );
    expect(other.detail).toBe("");
    expect(other.lastBackup).toBe("Last backup: Never");

    delete status.progress;
    expect(
      selectViewData({ state: { status }, props: { settings: false }, i18n })
        .message,
    ).toBe("Checking projects for changes…");
  });

  it("hides short waits until they keep coming back", () => {
    const status = {
      configured: true,
      projects: [
        { id: "one", name: "Project One", error: "busy", failures: 2 },
      ],
    };
    const view = () =>
      selectViewData({ state: { status }, props: { settings: false }, i18n });
    expect(view().tone).toBe("ok");
    expect(view().message).toBe(i18n.androidBackup.notBackedUpYet);
    status.projects[0].failures = 6;
    expect(view().message).toBe(i18n.androidBackupErrors.busy);
  });

  it("shows the details when a manual backup cannot start", async () => {
    const state = backupStatusStore.createInitialState();
    const store = Object.fromEntries(
      Object.entries(backupStatusStore)
        .filter(([key]) => key.startsWith("set") || key.startsWith("select"))
        .map(([key, fn]) => [key, (payload) => fn({ state, i18n }, payload)]),
    );
    store.setStatus({
      status: { configured: true, projects: [] },
      currentProjectId: "one",
    });
    const appService = {
      backupNow: vi.fn(async () => {
        throw new Error("bridge");
      }),
      showAlert: vi.fn(),
    };
    await backupStatusHandlers.handleBackUpNow({
      appService,
      store,
      render: vi.fn(),
      i18n,
    });
    expect(appService.backupNow).toHaveBeenCalledWith("one");
    expect(appService.showAlert).toHaveBeenCalledWith({
      message: expect.stringMatching(
        /^Could not start the backup\. Try again\.\n\nDetails:\n.*bridge/,
      ),
    });
    expect(state.starting).toBe(false);
  });

  it("renders backup wording and requires an explicit skip confirmation", async () => {
    const deps = fixture();
    expect(deps.store.selectViewData().title).toBe("Setup backup folder");
    handlers.handleSkip(deps);
    expect(deps.store.selectViewData().copy.skipWarning).toContain(
      "ALL PROJECTS",
    );
    expect(deps.state.skipDialogOpen).toBe(true);
    handlers.handleCloseSkip(deps);
    expect(deps.state.skipDialogOpen).toBe(false);
    expect(deps.appService.navigate).not.toHaveBeenCalled();
    handlers.handleSkip(deps);
    handlers.handleConfirmSkip(deps);
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/projects",
      undefined,
      { historyMode: "replace" },
    );
    // Setup opened from the Projects card or Config returns to where it opened.
    deps.appService.getPayload.mockReturnValue({ from: "config" });
    handlers.handleSkip(deps);
    handlers.handleConfirmSkip(deps);
    expect(deps.appService.back).toHaveBeenCalledOnce();
    expect(deps.appService.navigate).toHaveBeenCalledOnce();
  });
  it("cancellation preserves setup and existing backups require confirmation", async () => {
    const deps = fixture();
    await handlers.handleSetup(deps);
    expect(deps.state.isBusy).toBe(false);
    expect(deps.appService.confirmProjectFolderSetup).not.toHaveBeenCalled();
    deps.appService.pickProjectFolderSetup.mockResolvedValue({
      uri: "content://test",
    });
    await handlers.handleSetup(deps);
    expect(deps.appService.confirmProjectFolderSetup).toHaveBeenCalledOnce();
    expect(deps.state.savedFolder).toBeUndefined();
    expect(deps.state.isBusy).toBe(false);
  });
  it("keeps the setup card visible and distinguishes backup errors", () => {
    const status = {
      configured: true,
      projects: [
        {
          id: "one",
          name: "Project One",
          pending: false,
          snapshotAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        },
      ],
    };
    const view = () =>
      selectViewData({ state: { status }, props: { settings: false }, i18n });
    status.loading = true;
    expect(view().visible).toBe(false);
    delete status.loading;
    expect(view().visible).toBe(true);
    expect(view().title).toBe("Local backups");
    expect(view().message).toBe("Last backup: 5 min. ago");
    expect(view().tone).toBe("ok");
    status.projects[0].error = "lowSpace";
    expect(view().message).toContain("1 GB");
    expect(view().tone).toBe("warning");
    status.projects[0].error = "";
    status.projects.push({ id: "two", name: "Project Two", snapshotAt: "" });
    expect(view().someNotBackedUp).toBe(true);
    status.projects[0].snapshotAt = "";
    expect(view().someNotBackedUp).toBe(false);
    expect(view().message).toBe(
      "Not backed up yet. The first backup starts shortly.",
    );
    status.projects = [];
    expect(view().message).toBe("Automatic backups are enabled.");
  });
});
