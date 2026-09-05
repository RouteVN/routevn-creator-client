import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUserConfigService,
  USER_CONFIG_DB_KEY,
} from "../../src/deps/services/shared/userConfigService.js";

describe("userConfigService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads from the app DB and persists updates back to userConfig", async () => {
    const db = {
      get: vi.fn(async () => ({
        auth: {
          user: {
            id: "user-1",
          },
        },
      })),
      set: vi.fn(async () => {}),
    };

    const service = createUserConfigService({
      db,
      writeDelayMs: 10,
    });

    await service.initUserConfig();

    expect(db.get).toHaveBeenCalledWith(USER_CONFIG_DB_KEY);
    expect(service.getUserConfig("auth.user")).toEqual({
      id: "user-1",
    });
    expect(service.getUserConfig("groupImagesView.itemsPerRow")).toBe(6);

    service.setUserConfig("sceneEditor.showLineNumbers", false);
    expect(service.getUserConfig("sceneEditor.showLineNumbers")).toBe(false);

    await vi.advanceTimersByTimeAsync(10);

    expect(db.set).toHaveBeenCalledWith(
      USER_CONFIG_DB_KEY,
      expect.objectContaining({
        auth: {
          user: {
            id: "user-1",
          },
        },
        sceneEditor: {
          showLineNumbers: false,
        },
      }),
    );
  });

  it("falls back to defaults when loading fails", async () => {
    const onLoadError = vi.fn();
    const service = createUserConfigService({
      db: {
        get: vi.fn(async () => {
          throw new Error("load failed");
        }),
        set: vi.fn(async () => {}),
      },
      onLoadError,
      writeDelayMs: 10,
    });

    await service.initUserConfig();

    expect(onLoadError).toHaveBeenCalledTimes(1);
    expect(service.getUserConfig("groupImagesView.itemsPerRow")).toBe(6);
    expect(service.getUserConfig("auth.user")).toBe(undefined);
  });

  it("removes cleared keys instead of persisting empty values", async () => {
    const db = {
      get: vi.fn(async () => ({
        auth: {
          session: {
            authToken: "token-1",
          },
          user: {
            id: "user-1",
          },
        },
        scenesMap: {
          selectedSceneIdByProject: {
            "project-1": "scene-1",
          },
        },
      })),
      set: vi.fn(async () => {}),
    };

    const service = createUserConfigService({
      db,
      writeDelayMs: 10,
    });

    await service.initUserConfig();

    service.setUserConfig("auth.session", undefined);
    service.setUserConfig("auth.user", undefined);
    service.setUserConfig(
      "scenesMap.selectedSceneIdByProject.project-1",
      undefined,
    );

    expect(service.getUserConfig("auth.session")).toBe(undefined);
    expect(service.getUserConfig("auth.user")).toBe(undefined);
    expect(
      service.getUserConfig("scenesMap.selectedSceneIdByProject.project-1"),
    ).toBe(undefined);

    await vi.advanceTimersByTimeAsync(10);

    const [key, saved] = db.set.mock.lastCall;
    expect(key).toBe(USER_CONFIG_DB_KEY);
    expect(saved.groupImagesView.itemsPerRow).toBe(6);
    expect(saved).not.toHaveProperty("auth");
    expect(saved).not.toHaveProperty("scenesMap");
  });

  it("reports autosave errors once, rejects failed flushes, and retries retained settings", async () => {
    const failure = new Error("Database write failed");
    const db = { set: vi.fn().mockRejectedValue(failure) };
    const onPersistError = vi.fn();
    const service = createUserConfigService({
      db,
      onPersistError,
      writeDelayMs: 10,
    });
    service.setUserConfig("appearance.theme", "light");
    await vi.advanceTimersByTimeAsync(10);
    expect(onPersistError).toHaveBeenCalledWith(failure);

    await expect(service.flushUserConfig()).rejects.toThrow(failure);
    expect(onPersistError).toHaveBeenCalledTimes(1);
    expect(service.getUserConfig("appearance.theme")).toBe("light");

    db.set.mockResolvedValueOnce(undefined);
    await expect(service.flushUserConfig()).resolves.toMatchObject({
      appearance: { theme: "light" },
    });
    expect(db.set).toHaveBeenLastCalledWith(
      USER_CONFIG_DB_KEY,
      expect.objectContaining({ appearance: { theme: "light" } }),
    );

    service.setUserConfig("appearance.theme", "dark");
    await vi.advanceTimersByTimeAsync(10);
    expect(onPersistError).toHaveBeenCalledTimes(2);
  });

  it("awaits an in-flight autosave before writing the latest settings during a flush", async () => {
    let finishAutosave;
    const db = {
      set: vi.fn().mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishAutosave = resolve;
          }),
      ),
    };
    const service = createUserConfigService({ db, writeDelayMs: 10 });
    service.setUserConfig("appearance.theme", "light");
    await vi.advanceTimersByTimeAsync(10);
    service.setUserConfig("appearance.theme", "dark");
    const flushed = vi.fn();
    const flushing = service.flushUserConfig().then(flushed);
    await vi.advanceTimersByTimeAsync(10);
    expect(db.set).toHaveBeenCalledTimes(1);
    expect(flushed).not.toHaveBeenCalled();
    finishAutosave();
    await flushing;
    expect(db.set).toHaveBeenCalledTimes(2);
    expect(db.set).toHaveBeenLastCalledWith(
      USER_CONFIG_DB_KEY,
      expect.objectContaining({ appearance: { theme: "dark" } }),
    );
  });
});
