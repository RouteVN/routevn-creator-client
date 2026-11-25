import { describe, expect, it, vi } from "vitest";
import {
  CreatorRequestError,
  createCreatorClient,
  resolveCreatorRpcUrl,
} from "../../src/deps/clients/creatorClient.js";

const RPC_URL = "http://127.0.0.1:3100/creator/rpc";
const SHA256 =
  "f2fe35278a74e0b0ae5757b6bb8bfc84554c80fa63a081373f43de987981a3af";

const respond = (body, { status = 200, headers = {} } = {}) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  }));

const link = {
  uploadUrl: "https://storage.example/debug-uploads/Dbg1/abc?signature=1",
  requiredHeaders: [
    { name: "If-None-Match", value: "*" },
    { name: "Content-Type", value: "application/octet-stream" },
  ],
  expiresAt: 1795610400000,
  completeBefore: 1795696200000,
};

const caught = async (promise) => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to fail.");
};

describe("creator client", () => {
  it("prepares an upload with the code, the file and the device", async () => {
    const fetchImpl = respond({ jsonrpc: "2.0", id: 1, result: link });
    const client = createCreatorClient({ url: RPC_URL, fetchImpl });

    const result = await client.prepareDebugUpload({
      code: "K7QM4X",
      sizeBytes: 1000,
      sha256: SHA256,
      device: { id: "123456789ABC123456789ABC", os: "linux" },
    });

    expect(result).toEqual(link);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe(RPC_URL);
    expect(request).toMatchObject({
      method: "POST",
      credentials: "omit",
      redirect: "error",
      headers: { "Content-Type": "application/json", "X-RouteVN-RPC": "1" },
    });
    expect(JSON.parse(request.body)).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "creator.prepareDebugUpload",
      params: {
        code: "K7QM4X",
        data: { sizeBytes: 1000, sha256: SHA256 },
        device: { id: "123456789ABC123456789ABC", os: "linux" },
      },
    });
  });

  it("leaves the device out when there is none", async () => {
    const fetchImpl = respond({ result: link });
    await createCreatorClient({ url: RPC_URL, fetchImpl }).prepareDebugUpload({
      code: "K7QM4X",
      sizeBytes: 1,
      sha256: SHA256,
    });
    expect(
      JSON.parse(fetchImpl.mock.calls[0][1].body).params,
    ).not.toHaveProperty("device");
  });

  it("completes an upload and returns when support's copy is deleted", async () => {
    const fetchImpl = respond({ result: { deleteAfter: 1798202400000 } });
    const client = createCreatorClient({ url: RPC_URL, fetchImpl });

    expect(
      await client.completeDebugUpload({ code: "K7QM4X", sha256: SHA256 }),
    ).toEqual({ deleteAfter: 1798202400000 });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      method: "creator.completeDebugUpload",
      params: { code: "K7QM4X", sha256: SHA256 },
    });
  });

  it("passes the API's error code and details on", async () => {
    const fetchImpl = respond({
      error: {
        code: -32000,
        message: "Domain error",
        data: { code: "DEBUG_CODE_UNUSABLE", details: { reason: "USED" } },
      },
    });
    const error = await caught(
      createCreatorClient({ url: RPC_URL, fetchImpl }).completeDebugUpload({
        code: "K7QM4X",
        sha256: SHA256,
      }),
    );
    expect(error).toBeInstanceOf(CreatorRequestError);
    expect(error.code).toBe("DEBUG_CODE_UNUSABLE");
    expect(error.details).toEqual({ reason: "USED" });
  });

  it("reports a refused call with how long to wait", async () => {
    const fetchImpl = respond("", {
      status: 429,
      headers: { "Retry-After": "42" },
    });
    const error = await caught(
      createCreatorClient({ url: RPC_URL, fetchImpl }).completeDebugUpload({
        code: "K7QM4X",
        sha256: SHA256,
      }),
    );
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.details).toEqual({ retryAfterMs: 42000 });
  });

  it("reports no connection, server errors and odd answers as unavailable", async () => {
    const failures = [
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
      respond("", { status: 503 }),
      respond("not json"),
      respond({ result: { ...link, uploadUrl: "ftp://storage.example/x" } }),
      respond({ result: { ...link, requiredHeaders: [{ name: "X" }] } }),
      respond({ result: { ...link, completeBefore: "soon" } }),
    ];
    for (const fetchImpl of failures) {
      const error = await caught(
        createCreatorClient({ url: RPC_URL, fetchImpl }).prepareDebugUpload({
          code: "K7QM4X",
          sizeBytes: 1,
          sha256: SHA256,
        }),
      );
      expect(error.code).toBe("UNAVAILABLE");
    }
  });

  it("calls the production API from release builds and the local one from development", () => {
    expect(resolveCreatorRpcUrl()).toBe("https://api1.routevn.com/creator/rpc");
    expect(resolveCreatorRpcUrl({ debug: true })).toBe(RPC_URL);
    expect(
      resolveCreatorRpcUrl({
        debug: true,
        override: "http://localhost:3000/creator/rpc",
      }),
    ).toBe("http://localhost:3000/creator/rpc");
    expect(
      resolveCreatorRpcUrl({ override: "http://localhost:3000/creator/rpc" }),
    ).toBe("https://api1.routevn.com/creator/rpc");
    expect(
      resolveCreatorRpcUrl({ page: new URL("http://localhost:3001/") }),
    ).toBe(RPC_URL);
    expect(resolveCreatorRpcUrl({ page: new URL("tauri://localhost/") })).toBe(
      "https://api1.routevn.com/creator/rpc",
    );
  });
});
