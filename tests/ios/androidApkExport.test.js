import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { callIOSBridge } = vi.hoisted(() => ({ callIOSBridge: vi.fn() }));

vi.mock("../../src/deps/clients/ios/bridge.js", async (importOriginal) => ({
  ...(await importOriginal()),
  callIOSBridge,
}));

import { createIOSProjectServiceAdapters } from "../../src/deps/services/ios/projectServiceAdapters.js";

const createFileAdapter = () =>
  createIOSProjectServiceAdapters({ collabLog: vi.fn(), creatorVersion: 1 })
    .fileAdapter;

const exportRequest = () => ({
  projectData: { story: { initialSceneId: "scene-1" } },
  fileEntries: [
    { fileId: " image-1 ", mimeType: "image/png" },
    { id: "sound-1" },
  ],
  outputPath: "routevn-save://selected/export-1",
  applicationId: "com.example.projectone",
  applicationName: " Project One ",
  versionName: "1.0.0",
  versionCode: 1,
  orientation: "landscape",
  iconFileId: " icon-1 ",
  iconBackgroundColor: "#ffffff",
  splashBackgroundColor: "#112233",
  getCurrentReference: () => ({
    projectId: "cached-project",
    repositoryProjectId: " project-1 ",
  }),
});

describe("iOS Android APK export adapter", () => {
  beforeEach(() => {
    callIOSBridge.mockReset();
  });
  afterEach(() => {
    delete globalThis.__routeVNApkExportProgress;
  });

  it("checks the native host capability and reports bridge failures as unavailable", async () => {
    const adapter = createFileAdapter();
    callIOSBridge.mockResolvedValueOnce({ available: true });
    await expect(adapter.getAndroidExportAvailability()).resolves.toEqual({
      available: true,
      reason: undefined,
    });
    expect(callIOSBridge).toHaveBeenCalledWith(
      "getAndroidExportAvailability",
      {},
    );
    callIOSBridge.mockRejectedValueOnce(new Error("Template unavailable"));
    await expect(adapter.getAndroidExportAvailability()).resolves.toEqual({
      available: false,
      reason: "Template unavailable",
    });
  });

  it("uses the iOS save picker for APK destinations, including cancellation", async () => {
    const saveFilePicker = vi.fn().mockResolvedValue(undefined);
    await expect(
      createFileAdapter().promptAndroidApkPath({
        defaultFileName: "project-one.apk",
        options: { title: "Save APK", fileTypeName: "APK file" },
        filePicker: { saveFilePicker },
      }),
    ).resolves.toBeUndefined();
    expect(saveFilePicker).toHaveBeenCalledWith({
      title: "Save APK",
      defaultPath: "project-one.apk",
      filters: [{ name: "APK file", extensions: ["apk"] }],
      mimeType: "application/vnd.android.package-archive",
    });
    expect(callIOSBridge).not.toHaveBeenCalled();
  });

  it("sends safe project paths and export metadata and subscribes only for the active export", async () => {
    const request = exportRequest();
    const onProgress = vi.fn();
    let exportId;
    const progress = {
      phase: "encrypting",
      current: 12,
      total: 24,
      elapsedMs: 100,
    };
    const result = {
      uri: "file:///exports/project-one.apk",
      apkBytes: 1234,
      packageBinBytes: 1000,
      encryptedPayloadBytes: 1028,
      stats: { assetCount: 2 },
    };
    callIOSBridge.mockImplementation(async (method, payload) => {
      expect(method).toBe("exportAndroidApkToUri");
      exportId = payload.exportId;
      globalThis.__routeVNApkExportProgress({
        ...progress,
        exportId: "another-export",
      });
      expect(onProgress).not.toHaveBeenCalled();
      globalThis.__routeVNApkExportProgress({ ...progress, exportId });
      return result;
    });

    await expect(
      createFileAdapter().createAndroidApkToPath({
        ...request,
        options: { onProgress },
      }),
    ).resolves.toEqual({ ...result, outputPath: result.uri });
    expect(callIOSBridge).toHaveBeenCalledWith("exportAndroidApkToUri", {
      projectId: "project-1",
      uri: request.outputPath,
      exportId: expect.any(String),
      fileEntries: [
        { id: "image-1", mimeType: "image/png" },
        { id: "sound-1" },
      ],
      instructionsJson: JSON.stringify(request.projectData),
      applicationId: request.applicationId,
      applicationName: "Project One",
      versionName: "1.0.0",
      versionCode: 1,
      orientation: "landscape",
      iconFileId: "icon-1",
      iconBackgroundColor: "#FFFFFF",
      splashBackgroundColor: "#112233",
    });
    expect(onProgress).toHaveBeenCalledExactlyOnceWith(progress);
    globalThis.__routeVNApkExportProgress({ ...progress, exportId });
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes after native failures and preserves the bridge error", async () => {
    const onProgress = vi.fn();
    const error = Object.assign(new Error("The export failed."), {
      code: "write-failed",
    });
    let exportId;
    callIOSBridge.mockImplementation(async (_method, payload) => {
      exportId = payload.exportId;
      throw error;
    });
    await expect(
      createFileAdapter().createAndroidApkToPath({
        ...exportRequest(),
        getCurrentReference: () => ({ projectId: "project-1" }),
        options: { onProgress },
      }),
    ).rejects.toBe(error);
    expect(callIOSBridge.mock.calls[0][1].projectId).toBe("project-1");
    globalThis.__routeVNApkExportProgress({
      exportId,
      phase: "writing",
      current: 1,
      total: 2,
      elapsedMs: 100,
    });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it.each([
    { getCurrentReference: () => ({ projectId: "../project" }) },
    { fileEntries: [{ id: "../asset" }] },
    { iconFileId: "../icon" },
  ])(
    "rejects unsafe storage identifiers before exporting: %o",
    async (override) => {
      await expect(
        createFileAdapter().createAndroidApkToPath({
          ...exportRequest(),
          ...override,
        }),
      ).rejects.toThrow("is invalid.");
      expect(callIOSBridge).not.toHaveBeenCalled();
    },
  );
});
