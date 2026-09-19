import { describe, expect, it, vi } from "vitest";
import {
  getDeviceId,
  isDeviceId,
} from "../../src/deps/clients/deviceIdentity.js";

const store = (values = new Map()) => ({
  get: vi.fn(async (key) => values.get(key)),
  getOrSet: vi.fn(async (key, value) => {
    if (!values.has(key)) values.set(key, value);
    return values.get(key);
  }),
});

describe("app-local device identity", () => {
  it("persists one random ID across checks and recreated storage adapters", async () => {
    const values = new Map();
    const first = store(values);
    const id = await getDeviceId(first);
    expect(isDeviceId(id)).toBe(true);
    expect(await getDeviceId(first)).toBe(id);
    expect(await getDeviceId(store(values))).toBe(id);
    expect(first.getOrSet).toHaveBeenCalledExactlyOnceWith("deviceId", id);
  });

  it("coalesces concurrent first checks", async () => {
    const db = store();
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => getDeviceId(db)),
    );
    expect(new Set(ids).size).toBe(1);
    expect(db.getOrSet).toHaveBeenCalledTimes(1);
  });

  it("generates independent IDs for independent app storage", async () => {
    const ids = await Promise.all(
      Array.from({ length: 20 }, () => getDeviceId(store())),
    );
    expect(new Set(ids).size).toBe(20);
  });

  it("does not overwrite an invalid stored identity", async () => {
    for (const invalid of [123, "", "123456789ABC\n", "OOOOOOOOOOOO"]) {
      const db = store(new Map([["deviceId", invalid]]));
      await expect(getDeviceId(db)).rejects.toThrow(
        "Invalid persisted device ID",
      );
      expect(db.getOrSet).not.toHaveBeenCalled();
    }
  });

  it("uses the same stored winner across concurrent independent adapters", async () => {
    const values = new Map();
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => getDeviceId(store(values))),
    );
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(values.get("deviceId"));
  });

  it("does not return an unpersisted ID and permits retry after storage failure", async () => {
    const db = store();
    db.getOrSet.mockRejectedValueOnce(new Error("Disk full"));
    await expect(getDeviceId(db)).rejects.toThrow("Disk full");
    expect(isDeviceId(await getDeviceId(db))).toBe(true);
    expect(db.getOrSet).toHaveBeenCalledTimes(2);
  });

  it("propagates read failures instead of replacing the identity", async () => {
    const db = store();
    db.get.mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(getDeviceId(db)).rejects.toThrow("Database unavailable");
    expect(db.getOrSet).not.toHaveBeenCalled();
    expect(isDeviceId(await getDeviceId(db))).toBe(true);
  });
});
