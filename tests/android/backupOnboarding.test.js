import { describe, expect, it, vi } from "vitest";
import { createBackupService } from "../../src/deps/services/android/backupService.js";
import { createUserConfigService } from "../../src/deps/services/shared/userConfigService.js";

const fixture = async (
  nativeStatus = { configured: false, projects: [] },
  config,
) => {
  const rows = new Map();
  if (config) rows.set("userConfig", config);
  const db = {
    get: vi.fn(async (key) => structuredClone(rows.get(key))),
    set: vi.fn(async (key, value) => rows.set(key, structuredClone(value))),
  };
  const client = {
    status: vi.fn(async () => nativeStatus),
    configure: vi.fn(async () => ({ configured: true, projects: [] })),
    disable: vi.fn(async () => ({ configured: false, projects: [] })),
    beginPass: vi.fn(async () => ({ due: false })),
    isActive: () => true,
  };
  const mount = async () => {
    const userConfig = createUserConfigService({ db });
    await userConfig.initUserConfig();
    const service = createBackupService({ client, userConfig });
    await service.initialize();
    return { service, userConfig };
  };
  return { rows, db, client, mount, ...(await mount()) };
};

describe("Android backup onboarding app config", () => {
  it("persists explicit skip through JS userConfig and remembers it after restart", async () => {
    const f = await fixture(undefined, { appearance: { theme: "light" } });
    expect(
      f.userConfig.getUserConfig("androidBackupOnboarding"),
    ).toBeUndefined();
    expect(f.db.set).not.toHaveBeenCalled();
    await f.service.skip();
    expect(f.db.set).toHaveBeenCalledWith(
      "userConfig",
      expect.objectContaining({
        androidBackupOnboarding: true,
        appearance: { theme: "light" },
      }),
    );
    expect([...f.rows.keys()]).toEqual(["userConfig"]);
    const restarted = await f.mount();
    expect(restarted.userConfig.getUserConfig("androidBackupOnboarding")).toBe(
      true,
    );
    expect(restarted.service.getStatus().skipped).toBe(true);
  });

  it.each([{ configured: true }, { configured: false, skipped: true }])(
    "migrates existing native setup once: %j",
    async (status) => {
      const f = await fixture({ ...status, projects: [] });
      expect(f.rows.get("userConfig").androidBackupOnboarding).toBe(true);
      await f.service.refresh();
      expect(f.db.set).toHaveBeenCalledOnce();
    },
  );

  it("lets an explicit JS config value override a legacy skip", async () => {
    const f = await fixture(
      { configured: false, skipped: true, projects: [] },
      { androidBackupOnboarding: false },
    );
    expect(f.service.getStatus().skipped).toBe(false);
    expect(f.db.set).not.toHaveBeenCalled();
  });

  it("completes onboarding only after folder configuration succeeds", async () => {
    const f = await fixture();
    f.client.configure.mockResolvedValueOnce({
      needsExistingConfirmation: true,
    });
    await f.service.configure({ uri: "content://folder" });
    expect(f.db.set).not.toHaveBeenCalled();
    f.client.configure.mockRejectedValueOnce(new Error("picker failed"));
    await expect(
      f.service.configure({ uri: "content://folder" }),
    ).rejects.toThrow("picker failed");
    expect(f.db.set).not.toHaveBeenCalled();
    await f.service.configure({ uri: "content://folder" });
    expect(f.rows.get("userConfig").androidBackupOnboarding).toBe(true);
  });

  it("keeps onboarding acknowledged when backups are disabled", async () => {
    const f = await fixture();
    await f.service.disable();
    expect(f.rows.get("userConfig").androidBackupOnboarding).toBe(true);
    expect(f.service.getStatus()).toMatchObject({
      configured: false,
      skipped: true,
    });
    expect((await f.mount()).service.getStatus().skipped).toBe(true);
  });

  it("rejects a skip when JS config cannot be saved and allows retry", async () => {
    const f = await fixture();
    f.db.set.mockRejectedValueOnce(new Error("disk full"));
    await expect(f.service.skip()).rejects.toThrow("disk full");
    expect(
      f.userConfig.getUserConfig("androidBackupOnboarding"),
    ).toBeUndefined();
    expect(f.service.getStatus().skipped).toBe(false);
    await f.service.skip();
    expect(f.rows.get("userConfig").androidBackupOnboarding).toBe(true);
  });
});
