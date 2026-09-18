import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, it, expect, vi } from "vitest";
import * as actions from "../../src/pages/projectFolderSetup/projectFolderSetup.store.js";
import * as handlers from "../../src/pages/projectFolderSetup/projectFolderSetup.handlers.js";
import { selectViewData } from "../../src/components/android-backup-status/android-backup-status.store.js";
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
    skipBackupSetup: vi.fn(async () => {}),
    navigate: vi.fn(),
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
  it("keeps Projects errors summarized and Config details scoped to the selected project", () => {
    const status = {
      configured: true,
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
    expect(summary.message).toContain("1 GB");
    expect(summary.showWarning).toBe(true);
    expect(summary.projects).toEqual([]);

    const settings = selectViewData({ state, props: { settings: true }, i18n });
    expect(settings.projects).toHaveLength(1);
    expect(settings.projects[0].id).toBe("project-3");
    expect(settings.folder).toBe("/Backups/Project-3");
  });

  it("renders backup wording and requires an explicit skip confirmation", async () => {
    const deps = fixture();
    expect(deps.store.selectViewData().title).toBe("Setup backup folder");
    await handlers.handleSkip(deps);
    expect(deps.appService.skipBackupSetup).not.toHaveBeenCalled();
    expect(deps.store.selectViewData().copy.skipWarning).toContain(
      "ALL PROJECTS",
    );
    expect(deps.state.skipDialogOpen).toBe(true);
    handlers.handleCloseSkip(deps);
    expect(deps.state.skipDialogOpen).toBe(false);
    expect(deps.appService.skipBackupSetup).not.toHaveBeenCalled();
    handlers.handleSkip(deps);
    await handlers.handleConfirmSkip(deps);
    expect(deps.appService.skipBackupSetup).toHaveBeenCalledOnce();
    expect(deps.appService.navigate).toHaveBeenCalledWith(
      "/projects",
      undefined,
      { historyMode: "replace" },
    );
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
          name: "Project One",
          pending: false,
          snapshotAt: "2026-09-17T12:00:00.000Z",
        },
      ],
    };
    const view = () =>
      selectViewData({ state: { status }, props: { settings: false }, i18n });
    expect(view().visible).toBe(true);
    expect(view().title).toBe("Local backups");
    expect(view().showWarning).toBe(false);
    status.projects[0].error = "lowSpace";
    expect(view().visible).toBe(true);
    expect(view().message).toContain("1 GB");
    expect(view().showWarning).toBe(true);
    status.projects[0].error = "";
    status.projects[0].snapshotAt = "";
    expect(view().visible).toBe(true);
    expect(view().message).toBe("Automatic backups are enabled.");
  });
});
