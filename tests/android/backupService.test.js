import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBackupService,
  BACKUP_INTERVAL_MS,
  BACKUP_RESUME_DELAY_MS,
} from "../../src/deps/services/android/backupService.js";

afterEach(() => vi.useRealTimers());

const fixture = async ({ lastAttemptAt = 1000000 } = {}) => {
  vi.useFakeTimers();
  vi.setSystemTime(1000000);
  let active = true;
  let listener;
  let status = { configured: true, lastAttemptAt, projects: [] };
  const unsubscribe = vi.fn();
  const calls = [];
  const client = {
    status: vi.fn(async () => status),
    beginPass: vi.fn(async () => {
      status = { ...status, lastAttemptAt: Date.now() };
      return { due: true };
    }),
    pendingProjects: vi.fn(async () => {
      calls.push("check");
      return {
        projectIds: status.projects.filter((p) => p.pending).map((p) => p.id),
      };
    }),
    configure: vi.fn(
      async () => (status = { ...status, configured: true, lastAttemptAt: 0 }),
    ),
    skip: vi.fn(async () => (status = { ...status, skipped: true })),
    disable: vi.fn(
      async () => (status = { configured: false, skipped: true, projects: [] }),
    ),
    isActive: () => active,
    subscribeActive: (fn) => {
      listener = fn;
      return unsubscribe;
    },
  };
  const backupProject = vi.fn(async (id) => {
    calls.push(id);
  });
  const notify = vi.fn();
  const beforeBackup = vi.fn(async () => {
    calls.push("flush");
  });
  const service = createBackupService({
    client,
    backupProject,
    beforeBackup,
    notify,
  });
  await service.initialize();
  const stop = service.start(() => ({
    errors: { lowSpace: "Free up space", failed: "Try again" },
  }));
  return {
    service,
    client,
    backupProject,
    beforeBackup,
    notify,
    calls,
    stop,
    unsubscribe,
    advance: (ms = BACKUP_INTERVAL_MS) => vi.advanceTimersByTimeAsync(ms),
    projects: (projects) => {
      status = { ...status, projects };
    },
    active: (value) => {
      active = value;
      listener(value);
    },
  };
};

describe("Android disaster backup scheduling", () => {
  it("stays disabled across timers and resumes until explicitly configured again", async () => {
    const f = await fixture();
    await f.service.disable();
    expect(f.service.getStatus().configured).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    f.active(false);
    f.active(true);
    await f.advance(BACKUP_INTERVAL_MS * 3);
    await f.service.run(true);
    expect(f.client.beginPass).not.toHaveBeenCalled();
    await f.service.configure({ uri: "content://test" });
    await f.service.run();
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    f.stop();
  });

  it("finishes the current publication before disabling and skips remaining projects", async () => {
    const f = await fixture({ lastAttemptAt: 1 });
    f.projects([
      { id: "one", pending: true },
      { id: "two", pending: true },
    ]);
    let release;
    f.backupProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await f.advance(BACKUP_RESUME_DELAY_MS);
    const stopping = f.service.disable();
    expect(f.service.disable()).toBe(stopping);
    expect(f.client.disable).not.toHaveBeenCalled();
    f.active(false);
    f.active(true);
    await f.service.run(true);
    release();
    await stopping;
    expect(f.backupProject.mock.calls).toEqual([["one"]]);
    expect(f.client.disable).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    f.stop();
  });

  it("keeps the configuration and scheduled backups when disabling fails", async () => {
    const f = await fixture();
    f.client.disable.mockRejectedValue(new Error("preferences unavailable"));
    await expect(f.service.disable()).rejects.toThrow(
      "preferences unavailable",
    );
    expect(f.service.getStatus().configured).toBe(true);
    await f.advance();
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    f.stop();
  });

  it("lets an overdue app open before starting asynchronous backup work", async () => {
    const f = await fixture({ lastAttemptAt: 1 });
    f.projects([{ id: "one", pending: true }]);
    let release;
    f.beforeBackup.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    expect(f.client.beginPass).not.toHaveBeenCalled();
    await f.advance(BACKUP_RESUME_DELAY_MS - 1);
    expect(f.client.beginPass).not.toHaveBeenCalled();
    await f.advance(1);
    expect(f.beforeBackup).toHaveBeenCalledOnce();
    // Startup has returned and the event loop can run while persistence waits.
    const interaction = vi.fn();
    setTimeout(interaction, 0);
    await f.advance(1);
    expect(interaction).toHaveBeenCalledOnce();
    expect(f.backupProject).not.toHaveBeenCalled();
    release();
    await f.service.run();
    expect(f.backupProject).toHaveBeenCalledOnce();
    f.stop();
  });

  it("resumes nine minutes into the persisted cooldown and runs one minute later", async () => {
    const f = await fixture();
    f.active(false);
    expect(vi.getTimerCount()).toBe(0);
    await f.advance(9 * 60 * 1000);
    f.active(true);
    await f.advance(60 * 1000 - 1);
    expect(f.client.beginPass).not.toHaveBeenCalled();
    await f.advance(1);
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    await f.advance(BACKUP_INTERVAL_MS);
    expect(f.client.beginPass).toHaveBeenCalledTimes(2);
    f.stop();
  });

  it("uses the remaining persisted cooldown on a fresh launch", async () => {
    const f = await fixture({ lastAttemptAt: 1000000 - 9 * 60 * 1000 });
    await f.advance(60 * 1000 - 1);
    expect(f.client.beginPass).not.toHaveBeenCalled();
    await f.advance(1);
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    f.stop();
  });

  it("cancels a resume check when hidden and coalesces repeated resumes", async () => {
    const f = await fixture({ lastAttemptAt: 1 });
    await f.advance(1000);
    f.active(false);
    await f.advance(BACKUP_INTERVAL_MS);
    expect(f.client.beginPass).not.toHaveBeenCalled();
    f.active(true);
    f.active(true);
    expect(vi.getTimerCount()).toBe(1);
    await f.advance(BACKUP_RESUME_DELAY_MS);
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    f.active(false);
    f.active(true);
    await f.advance(BACKUP_RESUME_DELAY_MS);
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    f.stop();
  });

  it("keeps native claim failures throttled even if status cannot be refreshed", async () => {
    const f = await fixture({ lastAttemptAt: 1 });
    f.client.beginPass.mockRejectedValue(new Error("bridge unavailable"));
    f.client.status.mockRejectedValue(new Error("bridge unavailable"));
    await f.advance(BACKUP_RESUME_DELAY_MS);
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    f.active(false);
    f.active(true);
    await f.advance(BACKUP_INTERVAL_MS - 1);
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    await f.advance(1);
    expect(f.client.beginPass).toHaveBeenCalledTimes(2);
    f.stop();
  });

  it("stops before dirty detection if backgrounded while flushing drafts", async () => {
    const f = await fixture({ lastAttemptAt: 1 });
    let release;
    f.beforeBackup.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await f.advance(BACKUP_RESUME_DELAY_MS);
    f.active(false);
    release();
    await f.service.run();
    expect(f.client.pendingProjects).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    f.stop();
  });

  it("does not schedule another timer after stopping during a backup", async () => {
    const f = await fixture({ lastAttemptAt: 1 });
    f.projects([{ id: "one", pending: true }]);
    let release;
    f.backupProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    await f.advance(BACKUP_RESUME_DELAY_MS);
    const operation = f.service.run();
    f.stop();
    release();
    await operation;
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks after ten minutes, flushes drafts before dirty detection, and skips unchanged projects", async () => {
    const f = await fixture();
    await f.service.run();
    await f.advance(BACKUP_INTERVAL_MS - 1);
    await f.service.run();
    expect(f.client.beginPass).not.toHaveBeenCalled();
    await f.advance(1);
    await f.service.run();
    expect(f.calls).toEqual(["flush", "check"]);
    expect(f.backupProject).not.toHaveBeenCalled();
    f.stop();
  });
  it("does not run on background, catches up on resume, and prevents duplicate passes", async () => {
    const f = await fixture();
    f.projects([{ id: "one", pending: true }]);
    let release;
    f.backupProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    f.active(false);
    await f.advance();
    expect(f.client.beginPass).not.toHaveBeenCalled();
    f.active(true);
    await f.advance(BACKUP_RESUME_DELAY_MS);
    const first = f.service.run();
    expect(f.service.run(true)).toBe(first);
    await vi.waitFor(() => expect(f.backupProject).toHaveBeenCalledTimes(1));
    release();
    await first;
    expect(f.client.beginPass).toHaveBeenCalledTimes(1);
    f.stop();
  });
  it("does not let a low-space project starve another project, and deduplicates warnings", async () => {
    const f = await fixture();
    f.projects([
      { id: "one", pending: true },
      { id: "two", pending: true },
    ]);
    f.backupProject.mockImplementation(async (id) => {
      if (id === "one") throw Object.assign(new Error(), { code: "lowSpace" });
    });
    await f.service.run(true);
    expect(f.backupProject.mock.calls).toEqual([["one"], ["two"]]);
    expect(f.service.getStatus().error).toBe("lowSpace");
    await f.service.run(true);
    expect(f.notify).toHaveBeenCalledTimes(1);
    expect(f.notify).toHaveBeenCalledWith({
      message: "Free up space",
      status: "error",
    });
    f.stop();
  });
  it("keeps a change made during backup pending", async () => {
    const f = await fixture();
    f.projects([{ id: "one", pending: true }]);
    await f.service.run(true);
    expect(f.service.getStatus().projects[0].pending).toBe(true);
    expect(f.backupProject).toHaveBeenCalledTimes(1);
    await f.advance();
    await f.service.run();
    expect(f.backupProject).toHaveBeenCalledTimes(2);
    f.stop();
  });
  it("starts the initial pass on configuration without waiting for publication", async () => {
    const f = await fixture();
    f.projects([{ id: "one", pending: true }]);
    let release;
    f.backupProject.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const status = await f.service.configure({ uri: "content://test" });
    expect(status.configured).toBe(true);
    await vi.waitFor(() => expect(f.backupProject).toHaveBeenCalled());
    release();
    await f.service.run();
    f.stop();
  });
  it("surfaces a draft flush failure and does not publish stale data", async () => {
    const f = await fixture();
    f.beforeBackup.mockRejectedValue(new Error("save failed"));
    await f.service.run(true);
    expect(f.client.beginPass).toHaveBeenCalledOnce();
    expect(f.client.pendingProjects).not.toHaveBeenCalled();
    expect(f.backupProject).not.toHaveBeenCalled();
    expect(f.service.getStatus().error).toBe("failed");
    f.stop();
  });
});
