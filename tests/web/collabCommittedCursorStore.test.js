import { describe, expect, it, vi } from "vitest";
import {
  clearCommittedCursor,
  loadCommittedCursor,
  saveCommittedCursor,
} from "../../src/deps/services/web/collabCommittedCursorStore.js";

describe("collabCommittedCursorStore", () => {
  it("reads and writes committed cursors through adapter.app", async () => {
    const values = new Map();
    const adapter = {
      app: {
        get: vi.fn(async (key) => values.get(key)),
        set: vi.fn(async (key, value) => {
          values.set(key, value);
        }),
        remove: vi.fn(async (key) => {
          values.delete(key);
        }),
      },
    };

    await saveCommittedCursor({
      adapter,
      projectId: "project-1",
      cursor: 7,
    });

    await expect(
      loadCommittedCursor({
        adapter,
        projectId: "project-1",
      }),
    ).resolves.toBe(7);

    await clearCommittedCursor({
      adapter,
      projectId: "project-1",
    });

    await expect(
      loadCommittedCursor({
        adapter,
        projectId: "project-1",
      }),
    ).resolves.toBe(0);
    expect(adapter.app.set).toHaveBeenCalledWith(
      "collab.lastCommittedId:project-1",
      7,
    );
    expect(adapter.app.remove).toHaveBeenCalledWith(
      "collab.lastCommittedId:project-1",
    );
  });
});
