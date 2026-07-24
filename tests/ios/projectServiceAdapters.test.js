import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBundle } from "../../src/deps/services/shared/projectExportService.js";

const mocked = vi.hoisted(() => ({
  callIOSBridge: vi.fn(),
  createPersistedIOSProjectStore: vi.fn(),
  createWebIconAssets: vi.fn(async ({ variants }) =>
    variants.map(({ fileName, size }) => ({
      fileName,
      bytes: Uint8Array.from([size === 192 ? 192 : 255]),
    })),
  ),
  loadTemplate: vi.fn(),
}));

vi.mock("../../src/deps/clients/ios/bridge.js", async () => {
  const actual = await vi.importActual("../../src/deps/clients/ios/bridge.js");
  return {
    ...actual,
    callIOSBridge: mocked.callIOSBridge,
  };
});

vi.mock("../../src/deps/clients/web/webIconAssets.js", () => ({
  createWebIconAssets: mocked.createWebIconAssets,
}));

vi.mock("../../src/deps/services/ios/collabClientStore.js", async () => {
  const actual = await vi.importActual(
    "../../src/deps/services/ios/collabClientStore.js",
  );
  return {
    ...actual,
    createPersistedIOSProjectStore: mocked.createPersistedIOSProjectStore,
  };
});

vi.mock("../../src/deps/clients/web/templateLoader.js", async () => {
  const actual = await vi.importActual(
    "../../src/deps/clients/web/templateLoader.js",
  );
  return {
    ...actual,
    loadTemplate: mocked.loadTemplate,
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
    mocked.createPersistedIOSProjectStore.mockReset();
    mocked.loadTemplate.mockReset();
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
      manifestJson: '{"name":"Project One"}',
      webIconFileId: "file-1",
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

  it("rejects existing iOS project history before initialization writes", async () => {
    const store = {
      getRepositoryHistoryStats: vi.fn(async () => ({
        committedCount: 1,
        latestCommittedId: 1,
        draftCount: 0,
        latestDraftClock: 0,
      })),
      insertDraft: vi.fn(async () => {}),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      app: {
        set: vi.fn(async () => {}),
      },
    };
    mocked.createPersistedIOSProjectStore.mockResolvedValue(store);
    const { storageAdapter } = createIOSProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 2,
    });

    await expect(
      storageAdapter.initializeProject({
        projectId: "project-1",
        template: "blank",
        projectInfo: {
          id: "project-1",
          name: "Project One",
        },
        projectResolution: {
          width: 1280,
          height: 720,
        },
      }),
    ).rejects.toThrow(
      "Project storage is not empty. New project initialization requires empty storage.",
    );

    expect(mocked.createPersistedIOSProjectStore).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(store.getRepositoryHistoryStats).toHaveBeenCalledTimes(1);
    expect(mocked.callIOSBridge).not.toHaveBeenCalled();
    expect(mocked.loadTemplate).not.toHaveBeenCalled();
    expect(store.insertDraft).not.toHaveBeenCalled();
    expect(store.saveMaterializedViewCheckpoint).not.toHaveBeenCalled();
    expect(store.app.set).not.toHaveBeenCalled();
  });
});
