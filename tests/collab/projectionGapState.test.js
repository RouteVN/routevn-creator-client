import { describe, expect, it, vi } from "vitest";
import {
  clearProjectionGap,
  loadProjectionGap,
  saveProjectionGap,
} from "../../src/deps/services/shared/collab/projectionGapState.js";

describe("projectionGapState", () => {
  it("persists and reads projection-gap state through store.app", async () => {
    const values = new Map();
    const store = {
      app: {
        get: vi.fn(async (key) => values.get(key)),
        set: vi.fn(async (key, value) => {
          values.set(key, structuredClone(value));
        }),
        remove: vi.fn(async (key) => {
          values.delete(key);
        }),
      },
    };

    await saveProjectionGap(store, {
      commandType: "scene.create",
      remoteSchemaVersion: 2,
      supportedSchemaVersion: 1,
    });

    await expect(loadProjectionGap(store)).resolves.toEqual({
      commandType: "scene.create",
      remoteSchemaVersion: 2,
      supportedSchemaVersion: 1,
    });

    await clearProjectionGap(store);

    await expect(loadProjectionGap(store)).resolves.toBeUndefined();
    expect(store.app.set).toHaveBeenCalledWith(
      "projectorGap",
      expect.objectContaining({
        commandType: "scene.create",
      }),
    );
    expect(store.app.remove).toHaveBeenCalledWith("projectorGap");
  });
});
