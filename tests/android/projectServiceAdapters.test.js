import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseBundle } from "../../src/deps/services/shared/projectExportService.js";

const mocked = vi.hoisted(() => ({
  callAndroidBridge: vi.fn(),
  createPersistedAndroidProjectStore: vi.fn(),
  createWebIconAssets: vi.fn(async ({ variants }) =>
    variants.map(({ fileName, size }) => ({
      fileName,
      bytes: Uint8Array.from([size === 192 ? 192 : 255]),
    })),
  ),
  loadTemplate: vi.fn(),
  getTemplateFiles: vi.fn(),
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

vi.mock("../../src/deps/services/android/collabClientStore.js", async () => {
  const actual = await vi.importActual(
    "../../src/deps/services/android/collabClientStore.js",
  );
  return {
    ...actual,
    createPersistedAndroidProjectStore:
      mocked.createPersistedAndroidProjectStore,
  };
});

vi.mock("../../src/deps/clients/web/templateLoader.js", async () => {
  const actual = await vi.importActual(
    "../../src/deps/clients/web/templateLoader.js",
  );
  return {
    ...actual,
    loadTemplate: mocked.loadTemplate,
    getTemplateFiles: mocked.getTemplateFiles,
  };
});

import { createAndroidProjectServiceAdapters } from "../../src/deps/services/android/projectServiceAdapters.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";

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
    mocked.createPersistedAndroidProjectStore.mockReset();
    mocked.loadTemplate.mockReset();
    mocked.getTemplateFiles.mockReset();
    mocked.getTemplateFiles.mockResolvedValue([]);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores large project files through bounded ordered bridge chunks", async () => {
    const sourceBytes = Uint8Array.from(
      { length: 1_200_000 },
      (_, index) => index % 251,
    );
    const writtenChunks = [];
    let bytesWritten = 0;
    mocked.callAndroidBridge.mockImplementation((method, payload) => {
      if (method === "ensureProjectStorage") {
        return true;
      }
      if (method === "beginProjectFileWrite") {
        expect(payload).toEqual({
          projectId: "project-1",
          fileId: "video-file",
          mimeType: "video/mp4",
          size: sourceBytes.byteLength,
        });
        return { writeId: "write-1" };
      }
      if (method === "appendProjectFileWrite") {
        expect(payload.writeId).toBe("write-1");
        expect(payload.offset).toBe(bytesWritten);
        expect(payload.base64.length).toBeLessThanOrEqual(699_052);
        const chunk = Buffer.from(payload.base64, "base64");
        writtenChunks.push(chunk);
        bytesWritten += chunk.byteLength;
        return { bytesWritten };
      }
      if (method === "finishProjectFileWrite") {
        expect(payload).toEqual({ writeId: "write-1" });
        return { size: bytesWritten };
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    await expect(
      fileAdapter.storeFile({
        file: { type: "video/mp4" },
        bytes: toExactArrayBuffer(sourceBytes),
        idGenerator: () => "video-file",
        getCurrentReference: () => ({ projectId: "project-1" }),
      }),
    ).resolves.toMatchObject({ fileId: "video-file" });

    expect(
      mocked.callAndroidBridge.mock.calls.filter(
        ([method]) => method === "appendProjectFileWrite",
      ),
    ).toHaveLength(3);
    expect(Buffer.concat(writtenChunks)).toEqual(Buffer.from(sourceBytes));
    expect(mocked.callAndroidBridge).not.toHaveBeenCalledWith(
      "writeProjectFile",
      expect.anything(),
    );
  });

  it("aborts the native project file session when a chunk write fails", async () => {
    const sourceBytes = new Uint8Array(600_000);
    let appendCount = 0;
    mocked.callAndroidBridge.mockImplementation((method, payload) => {
      if (method === "ensureProjectStorage") {
        return true;
      }
      if (method === "beginProjectFileWrite") {
        return { writeId: "write-1" };
      }
      if (method === "appendProjectFileWrite") {
        appendCount += 1;
        if (appendCount === 2) {
          throw new Error("Native chunk write failed");
        }
        return {
          bytesWritten: Buffer.from(payload.base64, "base64").byteLength,
        };
      }
      if (method === "abortProjectFileWrite") {
        return true;
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    await expect(
      fileAdapter.storeFile({
        file: { type: "video/mp4" },
        bytes: toExactArrayBuffer(sourceBytes),
        idGenerator: () => "video-file",
        getCurrentReference: () => ({ projectId: "project-1" }),
      }),
    ).rejects.toThrow("Native chunk write failed");

    expect(mocked.callAndroidBridge).toHaveBeenCalledWith(
      "abortProjectFileWrite",
      { writeId: "write-1" },
    );
    expect(mocked.callAndroidBridge).not.toHaveBeenCalledWith(
      "finishProjectFileWrite",
      expect.anything(),
    );
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

  it("creates validated JavaScript ZIP bytes before writing a download", async () => {
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

      if (method === "writeDownloadFile") {
        savedPayload = payload;
        return "content://downloads/project_version.zip";
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    const savedPath = await fileAdapter.createDistributionZipStreamed({
      projectData: {
        projectData: {
          story: {
            initialSceneId: "scene-1",
          },
        },
      },
      fileEntries: [{ fileId: "file-1", mimeType: "image/png" }],
      zipName: "project_version",
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

    expect(savedPath).toBe("content://downloads/project_version.zip");
    expect(savedPayload.filename).toBe("project_version.zip");
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

  it("uses the native verified publisher for a selected Android ZIP URI", async () => {
    let savedPayload;
    mocked.callAndroidBridge.mockImplementation((method, payload) => {
      if (method === "createDistributionZipStreamedToUri") {
        savedPayload = payload;
        return { uri: payload.uri };
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    await expect(
      fileAdapter.createDistributionZipStreamedToPath({
        projectData: {
          projectData: { story: { initialSceneId: "scene-1" } },
        },
        fileEntries: [{ fileId: "file-1", mimeType: "image/png" }],
        outputPath: "content://exports/export.zip",
        staticFiles: {
          indexHtml: "<!doctype html>",
          mainJs: "console.log('routevn');",
          manifestJson: '{"name":"Project One"}',
          webIconFileId: "file-1",
        },
        getCurrentReference: () => ({ projectId: "project-1" }),
      }),
    ).resolves.toBe("content://exports/export.zip");

    expect(savedPayload).toMatchObject({
      projectId: "project-1",
      uri: "content://exports/export.zip",
      fileEntries: [{ id: "file-1", mimeType: "image/png" }],
      indexHtml: "<!doctype html>",
      mainJs: "console.log('routevn');",
      manifestJson: '{"name":"Project One"}',
      webIconFileId: "file-1",
      usePartFile: true,
    });
    expect(savedPayload.instructionsJson).toContain(
      '"initialSceneId":"scene-1"',
    );
    expect(mocked.callAndroidBridge).not.toHaveBeenCalledWith(
      "writeFileToUri",
      expect.anything(),
    );
  });

  it("rejects distribution exports when a required project file is missing", async () => {
    mocked.callAndroidBridge.mockImplementation((method) => {
      if (method === "readProjectFile") {
        throw new Error("Project file was not found.");
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const { fileAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 1,
    });

    await expect(
      fileAdapter.createDistributionZipStreamed({
        projectData: { projectData: {} },
        fileEntries: [{ fileId: "missing-file", mimeType: "image/png" }],
        zipName: "project_version",
        staticFiles: {},
        getCurrentReference: () => ({ projectId: "project-1" }),
      }),
    ).rejects.toThrow(
      "Required project file is missing during export: missing-file",
    );

    expect(mocked.callAndroidBridge).not.toHaveBeenCalledWith(
      "writeDownloadFile",
      expect.anything(),
    );
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

  it("rejects existing Android project storage before initialization writes", async () => {
    mocked.callAndroidBridge.mockImplementation((method) => {
      if (method === "getProjectStorageStatus") {
        return {
          exists: true,
          databaseFileExists: true,
          databaseDirectoryExists: true,
          projectDirectoryExists: false,
        };
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    const store = {
      insertDraft: vi.fn(async () => {}),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      app: {
        set: vi.fn(async () => {}),
      },
    };
    mocked.createPersistedAndroidProjectStore.mockResolvedValue(store);
    const { storageAdapter } = createAndroidProjectServiceAdapters({
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

    expect(mocked.callAndroidBridge).toHaveBeenCalledWith(
      "getProjectStorageStatus",
      {
        projectId: "project-1",
      },
    );
    expect(mocked.createPersistedAndroidProjectStore).not.toHaveBeenCalled();
    expect(mocked.loadTemplate).not.toHaveBeenCalled();
    expect(store.insertDraft).not.toHaveBeenCalled();
    expect(store.saveMaterializedViewCheckpoint).not.toHaveBeenCalled();
    expect(store.app.set).not.toHaveBeenCalled();
  });

  it("creates Android project storage only after the unused-storage check", async () => {
    mocked.callAndroidBridge.mockImplementation((method) => {
      if (method === "getProjectStorageStatus") {
        return {
          exists: false,
          databaseFileExists: false,
          databaseDirectoryExists: false,
          projectDirectoryExists: false,
        };
      }
      if (method === "ensureProjectStorage") {
        return true;
      }

      throw new Error(`Unexpected bridge method: ${method}`);
    });
    mocked.loadTemplate.mockResolvedValue(structuredClone(initialProjectData));
    const store = {
      insertDraft: vi.fn(async () => {}),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      app: {
        set: vi.fn(async () => {}),
      },
    };
    mocked.createPersistedAndroidProjectStore.mockResolvedValue(store);
    const { storageAdapter } = createAndroidProjectServiceAdapters({
      collabLog: vi.fn(),
      creatorVersion: 2,
    });

    await storageAdapter.initializeProject({
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
    });

    expect(mocked.callAndroidBridge).toHaveBeenNthCalledWith(
      1,
      "getProjectStorageStatus",
      {
        projectId: "project-1",
      },
    );
    expect(mocked.callAndroidBridge).toHaveBeenNthCalledWith(
      2,
      "ensureProjectStorage",
      {
        projectId: "project-1",
      },
    );
    expect(mocked.createPersistedAndroidProjectStore).toHaveBeenCalledWith({
      projectId: "project-1",
    });
    expect(store.insertDraft).toHaveBeenCalledTimes(1);
    expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(1);
    expect(store.app.set).toHaveBeenCalledTimes(2);
  });
});
