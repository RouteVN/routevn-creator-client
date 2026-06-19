import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBundle } from "../../src/deps/services/shared/projectExportService.js";

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

import { createAndroidProjectServiceAdapters } from "../../src/deps/services/android/projectServiceAdapters.js";

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");

const toExactArrayBuffer = (bytes) => {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

describe("android project service adapters", () => {
  beforeEach(() => {
    mocked.callAndroidBridge.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes streamed ZIP exports through the Android download bridge", async () => {
    let downloadPayload;
    mocked.callAndroidBridge.mockImplementation((method, payload) => {
      if (method === "readProjectFile") {
        expect(payload).toEqual({
          projectId: "project-1",
          fileId: "file-1",
        });
        return {
          base64: toBase64(Uint8Array.from([1, 2, 3])),
          mimeType: "image/png",
        };
      }

      if (method === "writeDownloadFile") {
        downloadPayload = payload;
        return "content://downloads/export.zip";
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    await expect(
      fileAdapter.promptDistributionZipPath({ zipName: "export" }),
    ).resolves.toBeUndefined();

    const savedPath = await fileAdapter.createDistributionZipStreamed({
      projectData: {
        projectData: {
          story: {
            initialSceneId: "scene-1",
          },
        },
      },
      fileEntries: [{ fileId: "file-1", mimeType: "image/png" }],
      zipName: "export",
      staticFiles: {
        indexHtml: "<!doctype html>",
        mainJs: "console.log('routevn');",
      },
      getCurrentReference: () => ({
        projectId: "project-1",
      }),
    });

    expect(savedPath).toBe("content://downloads/export.zip");
    expect(downloadPayload.filename).toBe("export.zip");
    expect(downloadPayload.mimeType).toBe("application/zip");

    const zipBytes = Buffer.from(downloadPayload.base64, "base64");
    const zip = await JSZip.loadAsync(zipBytes);
    expect(await zip.file("index.html").async("string")).toBe(
      "<!doctype html>",
    );
    expect(await zip.file("main.js").async("string")).toBe(
      "console.log('routevn');",
    );
    const packageBytes = new Uint8Array(
      await zip.file("package.bin").async("arraybuffer"),
    );
    const parsedBundle = await parseBundle(toExactArrayBuffer(packageBytes));
    expect(parsedBundle.instructions.projectData.story.initialSceneId).toBe(
      "scene-1",
    );
    expect(Array.from(parsedBundle.assets["file-1"].buffer)).toEqual([1, 2, 3]);
    expect(parsedBundle.assets["file-1"].mime).toBe("image/png");
  });

  it("rejects endpoint-backed Android collab sessions while disabled", async () => {
    const { collabAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    expect(() =>
      collabAdapter.createTransport({
        endpointUrl: "wss://api.example.invalid/sync",
      }),
    ).toThrow("Android remote collaboration is disabled.");

    await expect(
      collabAdapter.createSessionForProject({
        projectId: "project-1",
        userId: "user-1",
        clientId: "client-1",
        endpointUrl: "wss://api.example.invalid/sync",
        mode: "explicit",
        getRepositoryByProject: vi.fn(),
        getStoreByProject: vi.fn(),
      }),
    ).rejects.toThrow("Android remote collaboration is disabled.");
  });
});
