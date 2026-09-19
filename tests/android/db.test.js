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

  it("returns the native winner when another caller already initialized device identity", async () => {
    mocked.callAndroidBridge.mockImplementation(async (method) => {
      if (method === "appDbGetOrSet") return '"23456789ABCD"';
      return true;
    });
    const db = createDb({ path: "app.db" });
    await db.init();

    await expect(db.getOrSet("deviceId", "123456789ABC")).resolves.toBe(
      "23456789ABCD",
    );
    expect(mocked.callAndroidBridge.mock.calls).toEqual([
      ["appDbInit", { withEvents: false }],
      ["appDbGetOrSet", { key: "deviceId", valueJson: '"123456789ABC"' }],
    ]);
  });

  it("rejects unserializable values before native persistence", async () => {
    const db = createDb({ path: "app.db" });
    await db.init();
    mocked.callAndroidBridge.mockClear();
    const cyclic = {};
    cyclic.self = cyclic;

    for (const value of [undefined, () => {}, 1n, cyclic]) {
      await expect(db.getOrSet("deviceId", value)).rejects.toThrow();
    }
    await expect(db.getOrSet("", "123456789ABC")).rejects.toThrow();
    expect(mocked.callAndroidBridge).not.toHaveBeenCalled();
  });

  it("rejects absent or malformed native persisted values and propagates errors", async () => {
    const db = createDb({ path: "app.db" });
    await db.init();
    for (const result of [undefined, null, "{invalid"]) {
      mocked.callAndroidBridge.mockResolvedValueOnce(result);
      await expect(db.getOrSet("deviceId", "123456789ABC")).rejects.toThrow();
    }
    mocked.callAndroidBridge.mockRejectedValueOnce(new Error("Disk full"));
    await expect(db.getOrSet("deviceId", "123456789ABC")).rejects.toThrow(
      "Disk full",
    );
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
