import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPlayerRuntimeBridge,
  createPlayerRuntimeDb,
} from "../../src/deps/clients/shared/mobilePlayerRuntimeDb.js";
import { createPlayerRuntimePersistenceHost } from "../../src/deps/clients/shared/playerRuntimePersistenceHost.js";
import { createSaveSlot } from "../playerRuntimePersistenceFixtures.js";

const createFakeBridge = () => {
  const requests = [];
  const bridge = {
    postMessage: vi.fn((data) => requests.push(JSON.parse(data))),
  };
  const call = createPlayerRuntimeBridge({ bridge });
  const respond = (request, value, error) => {
    const response = { id: request.id, ok: error === undefined };
    if (error === undefined) response.value = value;
    else response.error = error;
    bridge.onmessage({ data: JSON.stringify(response) });
  };
  return { bridge, call, requests, respond };
};

const createDatabase = async () => {
  const fake = createFakeBridge();
  const db = createPlayerRuntimeDb({ call: fake.call });
  const initialized = db.init();
  await vi.waitFor(() => expect(fake.requests).toHaveLength(1));
  expect(fake.requests[0]).toEqual({ id: 1, method: "kv.init", payload: {} });
  fake.respond(fake.requests[0], null);
  await initialized;
  return { ...fake, db };
};

afterEach(() => vi.useRealTimers());

describe("Mobile player bridge", () => {
  it("uses numeric ids and object payloads and matches replies out of order", async () => {
    const { bridge, call, requests, respond } = createFakeBridge();
    const first = call("player.ready");
    const second = call("kv.list", { prefix: "saveSlots:" });
    expect(requests).toEqual([
      { id: 1, method: "player.ready", payload: {} },
      { id: 2, method: "kv.list", payload: { prefix: "saveSlots:" } },
    ]);
    bridge.onmessage({ data: "invalid JSON" });
    bridge.onmessage({ data: JSON.stringify({ id: 9, ok: true }) });
    respond(requests[1], []);
    respond(requests[0], null);
    await expect(second).resolves.toEqual([]);
    await expect(first).resolves.toBeNull();
  });

  it("rejects native errors, post failures, and timeouts", async () => {
    vi.useFakeTimers();
    const { bridge, call, requests, respond } = createFakeBridge();
    const failed = expect(call("kv.init")).rejects.toThrow(
      "Unsupported Db schema version: 2",
    );
    respond(requests[0], undefined, "Unsupported Db schema version: 2");
    await failed;
    bridge.postMessage.mockImplementationOnce(() => {
      throw new Error("Bridge closed");
    });
    await expect(call("kv.clear")).rejects.toThrow("Bridge closed");
    const timeout = expect(call("kv.list")).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(30_000);
    await timeout;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Mobile player runtime database", () => {
  it("round trips JSON text including null and preserves malformed rows for host validation", async () => {
    const { db, requests, respond } = await createDatabase();
    const write = db.set("example", { nested: [null, false, 2.5] });
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({
      id: 2,
      method: "kv.set",
      payload: { key: "example", value: '{"nested":[null,false,2.5]}' },
    });
    respond(requests[1], null);
    await write;
    const listed = db.list({ prefix: "example" });
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].payload).toEqual({ prefix: "example" });
    respond(requests[2], [
      { key: "example", value: '{"nested":[null,false,2.5]}' },
      { key: "example:null", value: "null" },
      { key: "example:corrupt", value: "invalid JSON" },
    ]);
    await expect(listed).resolves.toEqual([
      { key: "example", value: { nested: [null, false, 2.5] } },
      { key: "example:null", value: null },
      { key: "example:corrupt", value: "invalid JSON" },
    ]);
  });

  it("snapshots batches, coalesces duplicate keys, and lets deletes win", async () => {
    const { db, requests, respond } = await createDatabase();
    const value = { counter: 2 };
    const batch = db.applyBatch({
      puts: [
        { key: "a", value: 1 },
        { key: "a", value },
        { key: "b", value: false },
        { key: "c", value: null },
      ],
      deletes: ["b", "b"],
    });
    value.counter = 99;
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]).toEqual({
      id: 2,
      method: "kv.applyBatch",
      payload: {
        puts: [
          { key: "a", value: '{"counter":2}' },
          { key: "c", value: "null" },
        ],
        deletes: ["b"],
      },
    });
    respond(requests[1], null);
    await batch;
    await db.applyBatch({});
    expect(requests).toHaveLength(2);
  });

  it("validates all batch entries before posting and keeps the queue usable after a failed write", async () => {
    const { db, requests, respond } = await createDatabase();
    await expect(
      db.applyBatch({
        puts: [
          { key: "a", value: 1 },
          { key: "b", value: undefined },
        ],
      }),
    ).rejects.toThrow("JSON-serializable");
    await expect(db.applyBatch({ deletes: [""] })).rejects.toThrow(
      "non-empty string",
    );
    await expect(db.list({ prefix: 1 })).rejects.toThrow("must be a string");
    expect(requests).toHaveLength(1);
    const failed = expect(db.set("a", 1)).rejects.toThrow("disk full");
    const cleared = db.clear();
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    respond(requests[1], undefined, "disk full");
    await failed;
    await vi.waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2]).toEqual({ id: 3, method: "kv.clear", payload: {} });
    respond(requests[2], null);
    await cleared;
  });

  it("requires initialization and the fixed native database configuration", async () => {
    const call = vi.fn();
    const db = createPlayerRuntimeDb({ call });
    await expect(db.clear()).rejects.toThrow("not initialized");
    await expect(db.set("a", 1)).rejects.toThrow("not initialized");
    expect(call).not.toHaveBeenCalled();
    expect(() => createPlayerRuntimeDb({ schemaVersion: 2 })).toThrow(
      "schema version 1",
    );
  });

  it("uses the same semantic persistence host as desktop without loading Tauri", async () => {
    const call = vi.fn(async (method) => (method === "kv.list" ? [] : null));
    const host = createPlayerRuntimePersistenceHost({
      createDatabase: (options) => createPlayerRuntimeDb({ ...options, call }),
    });
    const persistence = host.createPersistence();
    await persistence.load();
    const slot = createSaveSlot(1);
    await persistence.saveSlots({ 1: slot });
    expect(call).toHaveBeenLastCalledWith("kv.applyBatch", {
      puts: [{ key: "saveSlots:1", value: JSON.stringify(slot) }],
      deletes: [],
    });
    await persistence.saveSlots({});
    expect(call).toHaveBeenLastCalledWith("kv.applyBatch", {
      puts: [],
      deletes: ["saveSlots:1"],
    });
    expect(() => persistence.saveGlobalRuntime({ muteAll: "yes" })).toThrow();
  });
});
