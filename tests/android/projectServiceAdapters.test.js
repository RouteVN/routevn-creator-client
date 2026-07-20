import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBundle } from "../../src/deps/services/shared/projectExportService.js";

const mocked = vi.hoisted(() => ({
  callAndroidBridge: vi.fn(),
  createWebIconAssets: vi.fn(async ({ variants }) =>
    variants.map(({ fileName, size }) => ({
      fileName,
      bytes: Uint8Array.from([size === 192 ? 192 : 255]),
    })),
  ),
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

vi.mock("../../src/deps/clients/web/webIconAssets.js", () => ({
  createWebIconAssets: mocked.createWebIconAssets,
}));

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

  it("prompts for distribution ZIP save location with the desktop ZIP name pattern", async () => {
    const saveFilePicker = vi.fn(async () => "content://exports/export.zip");
    const { fileAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    await expect(
      fileAdapter.promptDistributionZipPath({
        zipName: "project_version",
        filePicker: { saveFilePicker },
      }),
    ).resolves.toBe("content://exports/export.zip");

    expect(saveFilePicker).toHaveBeenCalledWith({
      title: "Save Distribution ZIP",
      defaultPath: "project_version.zip",
      filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      mimeType: "application/zip",
    });
  });

  it("writes streamed ZIP exports to the selected Android file URI", async () => {
    let savedPayload;
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

      if (method === "writeFileToUri") {
        savedPayload = payload;
        return "content://exports/export.zip";
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createAndroidProjectServiceAdapters({
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
      outputPath: "content://exports/export.zip",
      staticFiles: {
        indexHtml: "<!doctype html>",
        mainJs: "console.log('routevn');",
        manifestJson: '{"name":"Project One"}',
        webIconFileId: "file-1",
        webIconFiles: [
          { fileName: "app-icon-192.png", size: 192 },
          { fileName: "app-icon-512.png", size: 512 },
        ],
      },
      getCurrentReference: () => ({
        projectId: "project-1",
      }),
    });

    expect(savedPath).toBe("content://exports/export.zip");
    expect(savedPayload.uri).toBe("content://exports/export.zip");
    expect(savedPayload.mimeType).toBe("application/zip");

    const zipBytes = Buffer.from(savedPayload.base64, "base64");
    const zip = await JSZip.loadAsync(zipBytes);
    expect(await zip.file("index.html").async("string")).toBe(
      "<!doctype html>",
    );
    expect(await zip.file("main.js").async("string")).toBe(
      "console.log('routevn');",
    );
    expect(await zip.file("manifest.webmanifest").async("string")).toBe(
      '{"name":"Project One"}',
    );
    expect(
      Array.from(await zip.file("app-icon-192.png").async("uint8array")),
    ).toEqual([192]);
    expect(
      Array.from(await zip.file("app-icon-512.png").async("uint8array")),
    ).toEqual([255]);
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
