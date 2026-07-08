import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBundle } from "../../src/deps/services/shared/projectExportService.js";

const mocked = vi.hoisted(() => ({
  callIOSBridge: vi.fn(),
}));

vi.mock("../../src/deps/clients/ios/bridge.js", async () => {
  const actual = await vi.importActual("../../src/deps/clients/ios/bridge.js");
  return {
    ...actual,
    callIOSBridge: mocked.callIOSBridge,
  };
});

import { createIOSProjectServiceAdapters } from "../../src/deps/services/ios/projectServiceAdapters.js";

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");

const toExactArrayBuffer = (bytes) => {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
};

describe("ios project service adapters", () => {
  beforeEach(() => {
    mocked.callIOSBridge.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prompts for distribution ZIP save location with the desktop ZIP name pattern", async () => {
    const saveFilePicker = vi.fn(async () => "file:///exports/export.zip");
    const { fileAdapter } = createIOSProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    await expect(
      fileAdapter.promptDistributionZipPath({
        zipName: "project_version",
        filePicker: { saveFilePicker },
      }),
    ).resolves.toBe("file:///exports/export.zip");

    expect(saveFilePicker).toHaveBeenCalledWith({
      title: "Save Distribution ZIP",
      defaultPath: "project_version.zip",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      mimeType: "application/zip",
    });
  });

  it("delegates streamed ZIP exports to the native iOS bridge", async () => {
    let nativePayload;
    mocked.callIOSBridge.mockImplementation((method, payload) => {
      if (method === "createDistributionZipStreamedToUri") {
        nativePayload = payload;
        return Promise.resolve({
          uri: "file:///exports/native.zip",
          stats: {
            zipBytes: 1234,
          },
        });
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createIOSProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    const savedPath = await fileAdapter.createDistributionZipStreamedToPath({
      projectData: {
        projectData: {
          story: {
            initialSceneId: "scene-1",
          },
        },
      },
      fileEntries: [{ fileId: "file-1", mimeType: "image/png" }],
      outputPath: "routevn-folder://selected/export-folder",
      staticFiles: {
        indexHtml: "<!doctype html>",
        mainJs: "console.log('routevn');",
      },
      getCurrentReference: () => ({
        projectId: "project-1",
      }),
    });

    expect(savedPath).toBe("file:///exports/native.zip");
    expect(nativePayload).toEqual({
      projectId: "project-1",
      uri: "routevn-folder://selected/export-folder",
      fileEntries: [{ id: "file-1", mimeType: "image/png" }],
      instructionsJson: JSON.stringify({
        projectData: {
          story: {
            initialSceneId: "scene-1",
          },
        },
      }),
      usePartFile: true,
      indexHtml: "<!doctype html>",
      mainJs: "console.log('routevn');",
    });
  });

  it("falls back to a JavaScript ZIP written to the selected iOS file URI", async () => {
    let savedPayload;
    mocked.callIOSBridge.mockImplementation((method, payload) => {
      if (method === "createDistributionZipStreamedToUri") {
        return Promise.reject(new Error("Native ZIP unavailable"));
      }

      if (method === "readProjectFile") {
        expect(payload).toEqual({
          projectId: "project-1",
          fileId: "file-1",
        });
        return Promise.resolve({
          base64: toBase64(Uint8Array.from([1, 2, 3])),
          mimeType: "image/png",
        });
      }

      if (method === "writeFileToUri") {
        savedPayload = payload;
        return Promise.resolve("file:///exports/export.zip");
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createIOSProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    const savedPath = await fileAdapter.createDistributionZipStreamedToPath({
      projectData: {
        projectData: {
          story: {
            initialSceneId: "scene-1",
          },
        },
      },
      fileEntries: [{ fileId: "file-1", mimeType: "image/png" }],
      outputPath: "file:///exports/export.zip",
      staticFiles: {
        indexHtml: "<!doctype html>",
        mainJs: "console.log('routevn');",
      },
      getCurrentReference: () => ({
        projectId: "project-1",
      }),
    });

    expect(savedPath).toBe("file:///exports/export.zip");
    expect(savedPayload.uri).toBe("file:///exports/export.zip");
    expect(savedPayload.mimeType).toBe("application/zip");

    const zipBytes = Buffer.from(savedPayload.base64, "base64");
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

  it("rejects endpoint-backed iOS collab sessions while disabled", async () => {
    const { collabAdapter } = createIOSProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    expect(() =>
      collabAdapter.createTransport({
        endpointUrl: "wss://api.example.invalid/sync",
      }),
    ).toThrow("iOS remote collaboration is disabled.");

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
    ).rejects.toThrow("iOS remote collaboration is disabled.");
  });
});
