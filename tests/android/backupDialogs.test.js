import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";

const { bridge } = vi.hoisted(() => ({ bridge: vi.fn() }));
vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  NO_BRIDGE_TIMEOUT: Number.POSITIVE_INFINITY,
  callAndroidBridge: bridge,
}));

import { createAppService } from "../../src/deps/services/android/appService.js";

const i18n = yaml.load(
  readFileSync(new URL("../../src/i18n/en.yaml", import.meta.url), "utf8"),
);
const copy = () => ({
  ...i18n.androidBackup,
  errors: i18n.androidBackupErrors,
  errorDetailsLabel: i18n.appPage.errorDetailsLabel,
});
const status = (fields) => ({
  configured: true,
  loading: false,
  running: false,
  projects: [
    {
      id: "project-one",
      name: "Project One",
      pending: true,
      snapshotAt: "",
      error: "",
      failures: 0,
      ...fields,
    },
  ],
});

const fixture = ({ confirmed }) => {
  const windowTarget = {};
  vi.stubGlobal("window", windowTarget);
  bridge.mockReset();
  bridge.mockImplementation(async (method) => {
    if (method === "getBackupStatus") return status({});
    if (method === "requestBackup") return status({});
    if (method === "setBackupNotificationCopy") return {};
    throw new Error(`Unexpected method: ${method}`);
  });
  const globalUI = {
    showConfirm: vi.fn(async () => confirmed),
    showAlert: vi.fn(async () => {}),
    runWhenIdle: vi.fn(async (show) => show()),
  };
  const subject = { dispatch: vi.fn() };
  const appService = createAppService({
    db: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
    router: { getPayload: () => ({}) },
    globalUI,
    filePicker: {},
    openUrl: vi.fn(),
    appVersion: "test",
    platform: "test",
    distribution: "test",
    updatesEnabled: false,
    projectService: {},
    subject,
  });
  return { appService, globalUI, subject, windowTarget };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// Another dialog stays open until the test calls the returned function.
const holdDialogsOpen = (globalUI) => {
  const waiting = [];
  globalUI.runWhenIdle = vi.fn(
    (show) => new Promise((resolve) => waiting.push(() => resolve(show()))),
  );
  return () => waiting.splice(0).forEach((show) => show());
};

afterEach(() => vi.unstubAllGlobals());

describe("Android backup dialogs", () => {
  it("sends the notification copy and asks once to choose a lost folder again", async () => {
    const { appService, globalUI, subject, windowTarget } = fixture({
      confirmed: true,
    });
    await appService.initializeBackup();
    const stop = appService.startBackupChecks(copy);
    await settle();
    expect(bridge).toHaveBeenCalledWith("setBackupNotificationCopy", {
      channel: "Project backups",
      title: "Backing up projects",
    });

    windowTarget.routeVNBackupStatusChanged(
      status({ error: "reconnect", failures: 1 }),
    );
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "reconnect", failures: 2 }),
    );
    await settle();

    expect(globalUI.runWhenIdle).toHaveBeenCalledOnce();
    expect(globalUI.showConfirm).toHaveBeenCalledWith({
      title: "Backups need attention",
      message: i18n.androidBackupErrors.reconnect,
      confirmText: "Choose folder again",
      cancelText: "Later",
    });
    expect(subject.dispatch).toHaveBeenCalledWith(
      "redirect",
      expect.objectContaining({
        path: "/project-folder-setup",
        payload: { from: "config" },
      }),
    );
    stop();
  });

  it("offers to try again for low space and backs up when asked", async () => {
    const { appService, globalUI, windowTarget } = fixture({ confirmed: true });
    await appService.initializeBackup();
    const stop = appService.startBackupChecks(copy);
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "lowSpace", failures: 1 }),
    );
    await settle();
    expect(globalUI.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ confirmText: "Try again" }),
    );
    expect(bridge).toHaveBeenCalledWith("requestBackup", {
      projectId: undefined,
      reason: "manual",
    });
    stop();
  });

  it("shows the details when trying again cannot reach native code", async () => {
    const { appService, globalUI, windowTarget } = fixture({ confirmed: true });
    await appService.initializeBackup();
    const stop = appService.startBackupChecks(copy);
    bridge.mockImplementation(async (method) => {
      if (method === "requestBackup") throw new Error("bridge");
      return {};
    });
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "failed", failures: 3 }),
    );
    await settle();
    expect(globalUI.showAlert).toHaveBeenCalledWith({
      message: expect.stringMatching(
        /^Could not start the backup\. Try again\.\n\nDetails:\n.*bridge/,
      ),
    });
    stop();
  });

  it("asks once, about the latest problem, after another dialog closes", async () => {
    const { appService, globalUI, windowTarget } = fixture({
      confirmed: false,
    });
    const closeOtherDialog = holdDialogsOpen(globalUI);
    await appService.initializeBackup();
    const stop = appService.startBackupChecks(copy);
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "reconnect", failures: 1 }),
    );
    windowTarget.routeVNBackupStatusChanged(status({}));
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "lowSpace", failures: 1 }),
    );
    await settle();
    expect(globalUI.runWhenIdle).toHaveBeenCalledOnce();
    closeOtherDialog();
    await settle();
    expect(globalUI.showConfirm).toHaveBeenCalledOnce();
    expect(globalUI.showConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: i18n.androidBackupErrors.lowSpace,
        confirmText: "Try again",
      }),
    );
    stop();
  });

  it("does not ask about a problem that cleared while another dialog was open", async () => {
    const { appService, globalUI, windowTarget } = fixture({
      confirmed: false,
    });
    const closeOtherDialog = holdDialogsOpen(globalUI);
    await appService.initializeBackup();
    const stop = appService.startBackupChecks(copy);
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "reconnect", failures: 1 }),
    );
    windowTarget.routeVNBackupStatusChanged(status({ pending: false }));
    await settle();
    closeOtherDialog();
    await settle();
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
    stop();
  });

  it("reports a damaged project without blaming the backup folder", async () => {
    const { appService, globalUI, windowTarget } = fixture({
      confirmed: false,
    });
    await appService.initializeBackup();
    const stop = appService.startBackupChecks(copy);
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "projectDamaged", failures: 2 }),
    );
    await settle();
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
    windowTarget.routeVNBackupStatusChanged(
      status({ error: "projectDamaged", failures: 3 }),
    );
    await settle();
    expect(globalUI.showConfirm).toHaveBeenCalledWith({
      title: "Backups need attention",
      message: i18n.androidBackupErrors.projectDamaged,
      confirmText: "Try again",
      cancelText: "Later",
    });
    stop();
  });

  it("stays quiet for an error saved by an earlier run", async () => {
    const { appService, globalUI, windowTarget } = fixture({
      confirmed: false,
    });
    await appService.initializeBackup();
    const stop = appService.startBackupChecks(copy);
    windowTarget.routeVNBackupStatusChanged(status({ error: "reconnect" }));
    await settle();
    expect(globalUI.showConfirm).not.toHaveBeenCalled();
    stop();
  });
});
