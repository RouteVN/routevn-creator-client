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

  it("toasts when trying again cannot reach native code", async () => {
    const { appService, globalUI, windowTarget } = fixture({ confirmed: true });
    globalUI.showToast = vi.fn();
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
    expect(globalUI.showToast).toHaveBeenCalledWith({
      status: "error",
      message: "Could not start the backup. Try again.",
    });
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
