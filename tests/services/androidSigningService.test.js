import { describe, expect, it, vi } from "vitest";
import { createAndroidSigningService } from "../../src/deps/services/shared/androidSigningService.js";

const material = (digit) => ({
  certificateSha256: digit.repeat(64),
  certificate: `Y2VydC${digit}`,
  privateKey: `a2V5${digit}`,
});

const createService = (initial) => {
  const records = new Map();
  if (initial) records.set("project-1", structuredClone(initial));
  let projectId = "project-1";
  const fileAdapter = {
    createAndroidSigningKey: vi.fn(),
    readAndroidKeystore: vi.fn(),
    promptAndroidKeystorePath: vi.fn(async () => "/keys/one.p12"),
    promptAndroidKeyCopyPath: vi.fn(async () => "/keys/copy.p12"),
    writeAndroidKeystore: vi.fn(async () => undefined),
  };
  let time = 100;
  const service = createAndroidSigningService({
    fileAdapter,
    filePicker: {},
    getProjectId: () => projectId,
    getAndroidSigningByProjectId: vi.fn(async (id) =>
      structuredClone(records.get(id)),
    ),
    setAndroidSigningByProjectId: vi.fn(async (id, signing) => {
      records.set(id, structuredClone(signing));
    }),
    now: () => (time += 1),
  });
  return {
    service,
    fileAdapter,
    records,
    setProjectId: (id) => {
      projectId = id;
    },
  };
};

describe("androidSigningService", () => {
  it("makes one key however many signed exports start at once", async () => {
    const { service, fileAdapter, records } = createService();
    let finishKey;
    fileAdapter.createAndroidSigningKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishKey = () => resolve(material("1"));
        }),
    );
    const request = {
      applicationName: "Project One",
      applicationId: "com.example.project_one",
    };
    const first = service.ensureAndroidSigningKey(request);
    const second = service.ensureAndroidSigningKey(request);
    const third = service.ensureAndroidSigningKey(request);
    await vi.waitFor(() => expect(finishKey).toBeDefined());
    finishKey();

    expect(await first).toEqual({
      certificateSha256: "1".repeat(64),
      created: true,
    });
    expect(await second).toEqual({
      certificateSha256: "1".repeat(64),
      created: false,
    });
    expect(await third).toEqual({
      certificateSha256: "1".repeat(64),
      created: false,
    });
    expect(fileAdapter.createAndroidSigningKey).toHaveBeenCalledTimes(1);
    expect(fileAdapter.createAndroidSigningKey).toHaveBeenCalledWith(request);
    expect(records.get("project-1")).toEqual({
      currentKey: "1".repeat(64),
      keys: [{ ...material("1"), origin: "created", addedAt: 101 }],
    });
  });

  it("keeps a replaced key as a previous key and can use it again", async () => {
    const { service, fileAdapter, records } = createService();
    fileAdapter.createAndroidSigningKey
      .mockResolvedValueOnce(material("1"))
      .mockResolvedValueOnce(material("2"));
    await service.createAndroidSigningKey({
      applicationName: "Project One",
      applicationId: "com.example.project_one",
    });
    await service.createAndroidSigningKey({
      applicationName: "Project One",
      applicationId: "com.example.project_one",
    });
    expect(await service.getAndroidSigningSummary()).toEqual({
      currentKey: {
        certificateSha256: "2".repeat(64),
        origin: "created",
        addedAt: 102,
      },
      previousKeys: [
        { certificateSha256: "1".repeat(64), origin: "created", addedAt: 101 },
      ],
    });

    await service.useAndroidSigningKeyAgain("1".repeat(64));
    expect(records.get("project-1").currentKey).toBe("1".repeat(64));
    expect(records.get("project-1").keys).toHaveLength(2);
    await expect(
      service.useAndroidSigningKeyAgain("3".repeat(64)),
    ).rejects.toThrow("no signing key");
  });

  it("uploads a key once and keeps its first date", async () => {
    const { service, fileAdapter, records } = createService({
      currentKey: "1".repeat(64),
      keys: [{ ...material("1"), origin: "created", addedAt: 5 }],
    });
    fileAdapter.readAndroidKeystore.mockResolvedValue(material("2"));
    expect(
      await service.importAndroidSigningKey({
        path: "/keys/two.p12",
        password: "pass one",
        alias: undefined,
      }),
    ).toEqual({ certificateSha256: "2".repeat(64), changed: true });
    expect(fileAdapter.readAndroidKeystore).toHaveBeenCalledWith({
      path: "/keys/two.p12",
      password: "pass one",
      alias: undefined,
    });
    expect(
      await service.importAndroidSigningKey({ path: "/keys/two.p12" }),
    ).toEqual({ certificateSha256: "2".repeat(64), changed: false });

    // A previous key uploaded again becomes current with its old date.
    fileAdapter.readAndroidKeystore.mockResolvedValue(material("1"));
    await service.importAndroidSigningKey({ path: "/keys/one.p12" });
    expect(records.get("project-1")).toEqual({
      currentKey: "1".repeat(64),
      keys: [
        { ...material("1"), origin: "created", addedAt: 5 },
        { ...material("2"), origin: "uploaded", addedAt: 101 },
      ],
    });
  });

  it("saves a copy of any of the project's keys and passes keys to export", async () => {
    const { service, fileAdapter } = createService({
      currentKey: "1".repeat(64),
      keys: [{ ...material("1"), origin: "created", addedAt: 5 }],
    });
    await service.saveAndroidSigningKeyCopy({
      certificateSha256: "1".repeat(64),
      path: "/keys/copy.p12",
      password: "pass one",
    });
    expect(fileAdapter.writeAndroidKeystore).toHaveBeenCalledWith({
      path: "/keys/copy.p12",
      password: "pass one",
      alias: "key0",
      key: material("1"),
    });
    expect(await service.getAndroidSigningKeyMaterial("1".repeat(64))).toEqual(
      material("1"),
    );
    await expect(
      service.getAndroidSigningKeyMaterial("2".repeat(64)),
    ).rejects.toThrow("no signing key");
  });

  it("does not record a key that failed to be made", async () => {
    const { service, fileAdapter, records } = createService();
    fileAdapter.createAndroidSigningKey.mockRejectedValueOnce(
      new Error("Random source One failed"),
    );
    await expect(
      service.ensureAndroidSigningKey({
        applicationName: "Project One",
        applicationId: "com.example.project_one",
      }),
    ).rejects.toThrow("Random source One failed");
    expect(records.has("project-1")).toBe(false);

    // The next request is not stuck behind the failed one.
    fileAdapter.createAndroidSigningKey.mockResolvedValueOnce(material("1"));
    await service.ensureAndroidSigningKey({
      applicationName: "Project One",
      applicationId: "com.example.project_one",
    });
    expect(records.get("project-1").currentKey).toBe("1".repeat(64));
  });

  it("writes a key to the project that asked for it", async () => {
    const { service, fileAdapter, records, setProjectId } = createService();
    let finishKey;
    fileAdapter.createAndroidSigningKey.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishKey = () => resolve(material("1"));
        }),
    );
    const pending = service.ensureAndroidSigningKey({
      applicationName: "Project One",
      applicationId: "com.example.project_one",
    });
    await vi.waitFor(() => expect(finishKey).toBeDefined());
    setProjectId("project-2");
    finishKey();
    await pending;
    expect(records.get("project-1").currentKey).toBe("1".repeat(64));
    expect(records.has("project-2")).toBe(false);
  });

  it("ignores keys it cannot read but never drops them on a write", async () => {
    const unreadable = {
      ...material("2"),
      privateKey: "not base64!",
      origin: "created",
      addedAt: 3,
    };
    const later = {
      ...material("3"),
      origin: "created",
      addedAt: 4,
      protection: "password",
    };
    const { service, fileAdapter, records } = createService({
      currentKey: "2".repeat(64),
      keys: [{ ...material("1"), origin: "created", addedAt: 5 }, unreadable],
      laterField: { kept: true },
    });
    records.get("project-1").keys.push(later);

    // The current key is unreadable, so it is not offered, and a signed
    // export makes a new key.
    expect(await service.getAndroidSigningSummary()).toEqual({
      currentKey: undefined,
      previousKeys: [
        { certificateSha256: "1".repeat(64), origin: "created", addedAt: 5 },
        { certificateSha256: "3".repeat(64), origin: "created", addedAt: 4 },
      ],
    });
    fileAdapter.createAndroidSigningKey.mockResolvedValue(material("4"));
    await service.ensureAndroidSigningKey({
      applicationName: "Project One",
      applicationId: "com.example.project_one",
    });
    await service.useAndroidSigningKeyAgain("1".repeat(64));

    expect(records.get("project-1")).toEqual({
      currentKey: "1".repeat(64),
      keys: [
        { ...material("1"), origin: "created", addedAt: 5 },
        unreadable,
        later,
        { ...material("4"), origin: "created", addedAt: 101 },
      ],
      laterField: { kept: true },
    });
  });

  it("reports signing only for hosts with the signing commands", () => {
    const { service, fileAdapter } = createService();
    expect(service.supportsAndroidSigning()).toBe(true);
    delete fileAdapter.createAndroidSigningKey;
    expect(service.supportsAndroidSigning()).toBe(false);
  });
});
