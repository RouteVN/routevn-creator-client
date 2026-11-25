import { describe, expect, it, vi } from "vitest";
import { CreatorRequestError } from "../../src/deps/clients/creatorClient.js";
import { createSupportUploadService } from "../../src/deps/services/shared/supportUploadService.js";

const SHA256 =
  "f2fe35278a74e0b0ae5757b6bb8bfc84554c80fa63a081373f43de987981a3af";
const PROJECT = "/home/user/Projects/Project One";
const DEVICE = { id: "123456789ABC123456789ABC", os: "linux" };
const LINK = {
  uploadUrl: "https://storage.example/debug-uploads/key?signature=1",
  requiredHeaders: [{ name: "If-None-Match", value: "*" }],
  expiresAt: 1795610400000,
  completeBefore: 1795696200000,
};

// A host and API that succeed, recording each step in `calls`. Each part can
// be replaced to fail or to wait.
const setup = ({ host = {}, creatorClient = {}, getDevice } = {}) => {
  const calls = [];
  const record =
    (name, result) =>
    async (args = {}) => {
      calls.push([name, args]);
      return typeof result === "function" ? result(args) : result;
    };
  const fullHost = {
    createArchive: record("createArchive", ({ onProgress }) => {
      onProgress({ phase: "packing", current: 5, total: 10 });
      onProgress({ phase: "checking", current: 10, total: 12 });
      return { sizeBytes: 12, sha256: SHA256 };
    }),
    uploadArchive: record("uploadArchive", ({ onProgress }) => {
      onProgress({ current: 12, total: 12 });
      return { alreadyStored: false };
    }),
    cancelArchive: record("cancelArchive"),
    discardArchive: record("discardArchive"),
    ...host,
  };
  const fullCreatorClient = {
    prepareDebugUpload: record("prepareDebugUpload", LINK),
    completeDebugUpload: record("completeDebugUpload", {
      deleteAfter: 1798202400000,
    }),
    ...creatorClient,
  };
  const service = createSupportUploadService({
    host: fullHost,
    creatorClient: fullCreatorClient,
    getDevice: getDevice ?? (async () => DEVICE),
    createId: () => "Archive1",
  });
  return { service, calls, names: () => calls.map(([name]) => name) };
};

const caught = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the send to fail.");
};

const creatorError = (code, details) =>
  new CreatorRequestError(code, `failed with ${code}`, { details });

describe("support upload service", () => {
  it("packs, prepares, uploads and completes, then removes the packed file", async () => {
    const { service, calls, names } = setup();
    const onProgress = vi.fn();

    const result = await service.sendProject({
      projectPath: PROJECT,
      code: " k7q-m4x ",
      onProgress,
    });

    expect(result).toEqual({ deleteAfter: 1798202400000 });
    expect(names()).toEqual([
      "createArchive",
      "prepareDebugUpload",
      "uploadArchive",
      "completeDebugUpload",
      "discardArchive",
    ]);
    expect(calls[0][1]).toMatchObject({
      archiveId: "Archive1",
      projectPath: PROJECT,
    });
    expect(calls[1][1]).toEqual({
      code: "K7QM4X",
      sizeBytes: 12,
      sha256: SHA256,
      device: DEVICE,
    });
    expect(calls[2][1]).toMatchObject({
      archiveId: "Archive1",
      url: LINK.uploadUrl,
      headers: LINK.requiredHeaders,
    });
    expect(calls[3][1]).toEqual({ code: "K7QM4X", sha256: SHA256 });
    expect(calls[4][1]).toEqual({ archiveId: "Archive1" });
    expect(onProgress.mock.calls.map(([event]) => event)).toEqual([
      { stage: "packing", current: 0, total: 0 },
      { stage: "packing", current: 5, total: 10 },
      { stage: "checking", current: 10, total: 12 },
      { stage: "uploading", current: 0, total: 12 },
      { stage: "uploading", current: 12, total: 12 },
      { stage: "finishing" },
    ]);
  });

  it("completes when storage already holds the file from an earlier try", async () => {
    const { service, names } = setup({
      host: { uploadArchive: async () => ({ alreadyStored: true }) },
    });
    await service.sendProject({ projectPath: PROJECT, code: "K7QM4X" });
    expect(names()).toContain("completeDebugUpload");
  });

  it("sends without device facts when they can't be read", async () => {
    const { service, calls } = setup({
      getDevice: async () => {
        throw new Error("No device ID");
      },
    });
    await service.sendProject({ projectPath: PROJECT, code: "K7QM4X" });
    expect(calls[1][1].device).toBeUndefined();
  });

  it("refuses a code that is not a code before packing anything", async () => {
    const { service, names } = setup();
    const error = await caught(
      service.sendProject({ projectPath: PROJECT, code: "K7QM0X" }),
    );
    expect(error.code).toBe("invalidCode");
    expect(names()).toEqual([]);
  });

  it("refuses a project over 2 GB without calling the API", async () => {
    const { service, names } = setup({
      host: {
        createArchive: async () => ({
          sizeBytes: 2 * 1024 ** 3 + 1,
          sha256: SHA256,
        }),
      },
    });
    const error = await caught(
      service.sendProject({ projectPath: PROJECT, code: "K7QM4X" }),
    );
    expect(error.code).toBe("tooLarge");
    expect(names()).toEqual(["discardArchive"]);
  });

  it.each([
    ["DEBUG_CODE_UNUSABLE", { reason: "UNKNOWN" }, "codeUnknown"],
    ["DEBUG_CODE_UNUSABLE", { reason: "EXPIRED" }, "codeExpired"],
    ["DEBUG_CODE_UNUSABLE", { reason: "USED" }, "codeUsed"],
    ["DEBUG_CODE_RATE_LIMITED", { retryAfterMs: 60000 }, "rateLimited"],
    ["RATE_LIMITED", {}, "rateLimited"],
    [
      "VALIDATION_FAILED",
      { field: "data.sizeBytes", reason: "TOO_LARGE" },
      "tooLarge",
    ],
    [
      "VALIDATION_FAILED",
      { field: "data.sizeBytes", reason: "SIZE_MISMATCH" },
      "failed",
    ],
    ["UPLOAD_LIMIT_REACHED", { limit: 20 }, "tooManyAttempts"],
    ["DEBUG_UPLOADS_UNAVAILABLE", { reason: "NOT_CONFIGURED" }, "unavailable"],
    ["UNAVAILABLE", {}, "unavailable"],
  ])("tells %s %j apart as %s", async (code, details, expected) => {
    const { service, names } = setup({
      creatorClient: {
        prepareDebugUpload: async () => {
          throw creatorError(code, details);
        },
      },
    });
    const error = await caught(
      service.sendProject({ projectPath: PROJECT, code: "K7QM4X" }),
    );
    expect(error.code).toBe(expected);
    expect(names()).toEqual(["createArchive", "discardArchive"]);
    if (code === "DEBUG_CODE_RATE_LIMITED")
      expect(error.retryAfterMs).toBe(60000);
  });

  it("reports a code used up by another send while completing", async () => {
    const { service } = setup({
      creatorClient: {
        completeDebugUpload: async () => {
          throw creatorError("DEBUG_CODE_UNUSABLE", { reason: "USED" });
        },
      },
    });
    const error = await caught(
      service.sendProject({ projectPath: PROJECT, code: "K7QM4X" }),
    );
    expect(error.code).toBe("codeUsed");
  });

  it("keeps a failed packing or upload as the cause", async () => {
    const native = "uploadFailed: HTTP 403 Forbidden: SignatureDoesNotMatch";
    const { service, names } = setup({
      host: {
        uploadArchive: async () => {
          throw native;
        },
      },
    });
    const error = await caught(
      service.sendProject({ projectPath: PROJECT, code: "K7QM4X" }),
    );
    expect(error.code).toBe("failed");
    expect(error.cause).toBe(native);
    expect(names().at(-1)).toBe("discardArchive");
  });

  it("stops a send cancelled during its upload and removes the packed file", async () => {
    let failUpload;
    const { service, names } = setup({
      host: {
        uploadArchive: () =>
          new Promise((_resolve, reject) => {
            failUpload = reject;
          }),
        cancelArchive: async () => failUpload("cancelled: stopped"),
      },
    });
    const sending = service.sendProject({
      projectPath: PROJECT,
      code: "K7QM4X",
    });
    await vi.waitFor(() => expect(failUpload).toBeDefined());

    await service.cancel();

    expect((await caught(sending)).code).toBe("cancelled");
    expect(names()).toEqual([
      "createArchive",
      "prepareDebugUpload",
      "discardArchive",
    ]);
  });

  it("finishes a send whose upload is done, even if cancelled then", async () => {
    let finish;
    const cancelArchive = vi.fn();
    const { service } = setup({
      host: { cancelArchive },
      creatorClient: {
        completeDebugUpload: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      },
    });
    const sending = service.sendProject({
      projectPath: PROJECT,
      code: "K7QM4X",
    });
    await vi.waitFor(() => expect(finish).toBeDefined());

    await service.cancel();
    finish({ deleteAfter: 1798202400000 });

    expect(await sending).toEqual({ deleteAfter: 1798202400000 });
    expect(cancelArchive).not.toHaveBeenCalled();
  });

  it("sends one project at a time", async () => {
    let finishPacking;
    const packed = { sizeBytes: 12, sha256: SHA256 };
    const { service } = setup({
      host: {
        // The first packing waits; later ones finish at once.
        createArchive: () =>
          finishPacking
            ? Promise.resolve(packed)
            : new Promise((resolve) => {
                finishPacking = resolve;
              }),
      },
    });
    const first = service.sendProject({ projectPath: PROJECT, code: "K7QM4X" });
    await expect(
      service.sendProject({ projectPath: PROJECT, code: "K7QM4X" }),
    ).rejects.toThrow("already being sent");
    finishPacking(packed);
    await first;
    await service.sendProject({ projectPath: PROJECT, code: "K7QM4X" });
  });
});
