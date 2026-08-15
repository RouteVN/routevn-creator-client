import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  callAndroidBridge: vi.fn(),
}));

vi.mock("../../src/deps/clients/android/bridge.js", async () => {
  const actual = await vi.importActual(
    "../../src/deps/clients/android/bridge.js",
  );
  return {
    ...actual,
    callAndroidBridge: mocked.callAndroidBridge,
  };
});

import { createDb } from "../../src/deps/clients/android/db.js";

describe("Android global app database", () => {
  beforeEach(() => {
    mocked.callAndroidBridge.mockReset();
  });

  it("uses named app-state operations instead of the raw SQLite bridge", async () => {
    mocked.callAndroidBridge.mockImplementation(async (method) => {
      if (method === "appDbGet") {
        return JSON.stringify({ name: "Project One" });
      }
      return true;
    });
    const db = createDb({ path: "app.db" });

    await db.init();
    await expect(db.get("currentProject")).resolves.toEqual({
      name: "Project One",
    });
    await db.set("currentProject", { name: "Project One" });
    await db.remove("currentProject");

    expect(mocked.callAndroidBridge.mock.calls).toEqual([
      ["appDbInit", { withEvents: false }],
      ["appDbGet", { key: "currentProject" }],
      [
        "appDbSet",
        {
          key: "currentProject",
          valueJson: '{"name":"Project One"}',
        },
      ],
      ["appDbRemove", { key: "currentProject" }],
    ]);
    expect(
      mocked.callAndroidBridge.mock.calls.some(([method]) =>
        method.startsWith("sqlite"),
      ),
    ).toBe(false);
  });
});
