import { describe, expect, it, vi } from "vitest";
import { createAndroidBackupClient } from "../../src/deps/clients/android/backup.js";
import { createBackupService } from "../../src/deps/services/android/backupService.js";
import {
  findBackupProblem,
  findLatestBackup,
  findShownBackupError,
} from "../../src/internal/backupStatus.js";

const { bridge } = vi.hoisted(() => ({ bridge: vi.fn() }));
vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  callAndroidBridge: bridge,
}));

const configured = (projects) => ({
  configured: true,
  loading: false,
  running: false,
  folder: { uri: "content://backups", displayPath: "Documents/Backups" },
  projects,
});
const project = (fields) => ({
  id: "project-one",
  name: "Project One",
  pending: false,
  snapshotAt: "",
  error: "",
  failures: 0,
  ...fields,
});

const fixture = () => {
  const windowTarget = {};
  bridge.mockReset();
  bridge.mockImplementation(async (method) => {
    if (method === "getBackupStatus") return configured([project()]);
    if (method === "requestBackup") return configured([project()]);
    if (method === "setBackupNotificationCopy") return {};
    throw new Error(`Unexpected method: ${method}`);
  });
  const client = createAndroidBackupClient({ windowTarget });
  const service = createBackupService({ client });
  return { service, windowTarget };
};

describe("Android backup service", () => {
  it("shows loading until native status arrives and then follows native updates", async () => {
    const { service, windowTarget } = fixture();
    const seen = [];
    service.subscribe((status) => seen.push(status));
    expect(service.getStatus().loading).toBe(true);

    await service.initialize();
    expect(service.getStatus()).toEqual(configured([project()]));

    windowTarget.routeVNBackupStatusChanged(
      configured([project({ pending: true })]),
    );
    expect(service.getStatus().projects[0].pending).toBe(true);
    expect(seen).toHaveLength(3);
  });

  it("keeps a pushed update when an older reply arrives after it", async () => {
    const { service, windowTarget } = fixture();
    let reply;
    bridge.mockImplementationOnce(
      () => new Promise((resolve) => (reply = resolve)),
    );
    const refreshing = service.initialize();
    windowTarget.routeVNBackupStatusChanged({
      ...configured([project({ snapshotAt: "2026-11-25T10:00:00.000Z" })]),
      version: 8,
    });
    reply({ ...configured([project()]), running: true, version: 7 });
    await refreshing;
    expect(service.getStatus().version).toBe(8);
    expect(service.getStatus().running).toBe(false);
  });

  it("stops showing loading when native status cannot be read", async () => {
    const { service } = fixture();
    bridge.mockRejectedValueOnce(new Error("bridge"));
    await service.initialize();
    expect(service.getStatus()).toEqual({
      configured: false,
      projects: [],
      loading: false,
    });
  });

  it("only forwards requests and never waits for the backup itself", async () => {
    const { service } = fixture();
    await service.backupNow("project-one");
    expect(bridge).toHaveBeenCalledWith("requestBackup", {
      projectId: "project-one",
      reason: "manual",
    });

    bridge.mockRejectedValue(new Error("bridge"));
    expect(service.backupNewProject()).toBeUndefined();
    expect(service.setNotificationCopy({ channel: "c", title: "t" })).toBe(
      undefined,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(bridge).toHaveBeenCalledWith("requestBackup", {
      reason: "newProject",
    });
    expect(bridge).toHaveBeenCalledWith("setBackupNotificationCopy", {
      channel: "c",
      title: "t",
    });
  });

  it("keeps the current status while an existing folder waits for confirmation", async () => {
    const { service } = fixture();
    bridge.mockImplementation(async (method) => {
      if (method === "configureBackup")
        return { needsExistingConfirmation: true };
      throw new Error(`Unexpected method: ${method}`);
    });
    const result = await service.configure({ uri: "content://backups" });
    expect(result).toEqual({ needsExistingConfirmation: true });
    expect(service.getStatus().loading).toBe(true);
  });

  it("raises a problem once, and again only after it cleared or changed", async () => {
    const { service, windowTarget } = fixture();
    await service.initialize();
    const onProblem = vi.fn();
    const stop = service.watchProblems(onProblem);
    const push = (fields) =>
      windowTarget.routeVNBackupStatusChanged(configured([project(fields)]));

    push({ error: "reconnect", failures: 1 });
    push({ error: "reconnect", failures: 2 });
    expect(onProblem).toHaveBeenCalledOnce();
    expect(onProblem).toHaveBeenLastCalledWith({
      projectId: "project-one",
      name: "Project One",
      error: "reconnect",
      folderProblem: true,
    });

    push({ error: "lowSpace", failures: 3 });
    expect(onProblem).toHaveBeenCalledTimes(2);
    push({ snapshotAt: "2026-11-25T10:00:00.000Z" });
    push({ error: "lowSpace", failures: 1 });
    expect(onProblem).toHaveBeenCalledTimes(3);

    stop();
    push({ error: "reconnect", failures: 1 });
    expect(onProblem).toHaveBeenCalledTimes(3);
  });
});

describe("Android backup problems", () => {
  it("opens no dialog for errors saved by an earlier run or for short waits", () => {
    expect(
      findBackupProblem(configured([project({ error: "reconnect" })])),
    ).toBeUndefined();
    expect(
      findBackupProblem(configured([project({ error: "busy", failures: 20 })])),
    ).toBeUndefined();
    expect(
      findBackupProblem(
        configured([project({ error: "failed", failures: 2 })]),
      ),
    ).toBeUndefined();
    expect(
      findBackupProblem(configured([project({ error: "failed", failures: 3 })]))
        ?.error,
    ).toBe("failed");
    expect(
      findBackupProblem({
        configured: false,
        projects: [project({ error: "reconnect", failures: 1 })],
      }),
    ).toBeUndefined();
  });

  it("puts a folder problem before low space and other failures", () => {
    const projects = [
      project({ id: "a", error: "failed", failures: 5 }),
      project({ id: "b", error: "lowSpace", failures: 1 }),
      project({ id: "c", error: "nameConflict", failures: 1 }),
    ];
    expect(findBackupProblem(configured(projects))?.projectId).toBe("c");
    expect(findShownBackupError(projects.slice(0, 2))?.projectId).toBe("b");
  });

  it("shows saved errors on screen, and a short wait only once it keeps coming back", () => {
    expect(findShownBackupError([project({ error: "reconnect" })])?.error).toBe(
      "reconnect",
    );
    expect(
      findShownBackupError([project({ error: "busy", failures: 5 })]),
    ).toBeUndefined();
    expect(
      findShownBackupError([project({ error: "busy", failures: 6 })])?.error,
    ).toBe("busy");
  });

  it("finds the latest backup across projects", () => {
    expect(
      findLatestBackup([
        project({ snapshotAt: "2026-11-24T10:00:00.000Z" }),
        project({ snapshotAt: "" }),
        project({ snapshotAt: "2026-11-25T09:00:00.000Z" }),
      ]),
    ).toBe("2026-11-25T09:00:00.000Z");
    expect(findLatestBackup([project()])).toBeUndefined();
  });
});
