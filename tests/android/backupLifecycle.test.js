import { afterEach, expect, it, vi } from "vitest";
import { createUserConfigService } from "../../src/deps/services/shared/userConfigService.js";
import { createAndroidAudioRuntime } from "../../src/deps/clients/android/audioRuntime.js";
import { createAndroidBackupClient } from "../../src/deps/clients/android/backup.js";
import {
  createBackupService,
  BACKUP_INTERVAL_MS,
  BACKUP_RESUME_DELAY_MS,
} from "../../src/deps/services/android/backupService.js";

const { bridge } = vi.hoisted(() => ({ bridge: vi.fn() }));
vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  callAndroidBridge: bridge,
}));

afterEach(() => vi.useRealTimers());

it("cancels and resumes backups through the native lifecycle even when WebView visibility never changes", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(1000000);
  const documentTarget = new EventTarget();
  documentTarget.hidden = false;
  const windowTarget = {
    performance: { now: () => Date.now() },
    setTimeout,
    clearTimeout,
  };
  const runtime = createAndroidAudioRuntime({ windowTarget, documentTarget });
  let lastAttemptAt = 1;
  bridge.mockImplementation(async (method) => {
    if (method === "getBackupStatus")
      return { configured: true, lastAttemptAt, projects: [] };
    if (method === "beginBackupPass") {
      lastAttemptAt = Date.now();
      return { due: true };
    }
    if (method === "getPendingBackupProjects") return { projectIds: [] };
    throw new Error(`Unexpected method: ${method}`);
  });
  const beforeBackup = vi.fn();
  const client = createAndroidBackupClient({
    isActive: runtime.isActive,
    subscribeActive: runtime.subscribeActivity,
  });
  const service = createBackupService({
    client,
    userConfig: createUserConfigService({ db: { set: vi.fn() } }),
    beforeBackup,
    backupProject: vi.fn(),
    notify: vi.fn(),
  });
  await service.initialize();
  const stop = service.start(() => ({}));
  try {
    windowTarget.routeVNSetAppActive(false);
    expect(client.isActive()).toBe(false);
    expect(documentTarget.hidden).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(BACKUP_INTERVAL_MS);
    expect(beforeBackup).not.toHaveBeenCalled();

    windowTarget.routeVNSetAppActive(true);
    expect(client.isActive()).toBe(true);
    await vi.advanceTimersByTimeAsync(BACKUP_RESUME_DELAY_MS - 1);
    expect(beforeBackup).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(beforeBackup).toHaveBeenCalledOnce();

    windowTarget.routeVNSetAppActive(false);
    await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
    windowTarget.routeVNSetAppActive(true);
    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(beforeBackup).toHaveBeenCalledTimes(2);
  } finally {
    stop();
    await runtime.dispose();
  }
});
