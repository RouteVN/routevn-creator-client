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
    expect(service.getUserConfig("groupImagesView.zoomLevel")).toBe(1);

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
    expect(service.getUserConfig("groupImagesView.zoomLevel")).toBe(1);
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

    expect(db.set).toHaveBeenLastCalledWith(USER_CONFIG_DB_KEY, {
      groupImagesView: {
        zoomLevel: 1,
      },
    });
  });
});
