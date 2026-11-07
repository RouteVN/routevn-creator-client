import { describe, expect, it, vi } from "vitest";
import { createApkExportProgressClient } from "../../src/deps/clients/apkExportProgress.js";
import {
  ANDROID_APK_MIME_TYPE,
  createMobileAndroidApkExport,
} from "../../src/deps/services/shared/mobileAndroidApkExport.js";

const createExport = ({ callBridge, target = {} } = {}) => {
  const progressClient = createApkExportProgressClient({ target });
  return {
    target,
    androidApkExport: createMobileAndroidApkExport({
      callBridge,
      progressClient,
      resolveProjectId: (reference) => reference.projectId,
      assertSafeFileId: (fileId) => {
        if (fileId.includes("/")) {
          throw new Error(`Unsafe file id: ${fileId}`);
        }
        return fileId;
      },
    }),
  };
};

const exportRequest = (overrides = {}) => ({
  projectData: { projectData: { screen: { width: 1080, height: 1920 } } },
  fileEntries: [{ fileId: "file-1", mimeType: "image/png" }, { id: "file-2" }],
  outputPath: "content://documents/game.apk",
  applicationId: "com.example.game",
  applicationName: "  Project One  ",
  versionName: "1.2.3",
  versionCode: 7,
  orientation: "portrait",
  iconFileId: "icon-1",
  iconBackgroundColor: "#12ab34",
  splashBackgroundColor: "#000000",
  getCurrentReference: () => ({ projectId: "project-1" }),
  ...overrides,
});

describe("mobile Android APK export", () => {
  it("sends the export payload and forwards only this export's progress", async () => {
    let target;
    const callBridge = vi.fn(async (_method, payload) => {
      target.__routeVNApkExportProgress({
        exportId: "another-export",
        phase: "writeApk",
        current: 9,
        total: 10,
      });
      target.__routeVNApkExportProgress({
        exportId: payload.exportId,
        phase: "encryptPayload",
        current: 5,
        total: 10,
        elapsedMs: 120,
      });
      return { uri: "content://documents/saved.apk", apkBytes: 1234 };
    });
    const created = createExport({ callBridge });
    target = created.target;
    const onProgress = vi.fn();

    const result = await created.androidApkExport.createAndroidApkToPath(
      exportRequest({ options: { onProgress } }),
    );

    expect(callBridge).toHaveBeenCalledTimes(1);
    const [method, payload] = callBridge.mock.calls[0];
    expect(method).toBe("exportAndroidApkToUri");
    expect(payload).toEqual({
      projectId: "project-1",
      uri: "content://documents/game.apk",
      exportId: expect.any(String),
      fileEntries: [{ id: "file-1", mimeType: "image/png" }, { id: "file-2" }],
      instructionsJson: JSON.stringify({
        projectData: { screen: { width: 1080, height: 1920 } },
      }),
      applicationId: "com.example.game",
      applicationName: "Project One",
      versionName: "1.2.3",
      versionCode: 7,
      orientation: "portrait",
      iconFileId: "icon-1",
      iconBackgroundColor: "#12AB34",
      splashBackgroundColor: "#000000",
    });
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({
      phase: "encryptPayload",
      current: 5,
      total: 10,
      elapsedMs: 120,
    });
    expect(result.outputPath).toBe("content://documents/saved.apk");
    expect(result.apkBytes).toBe(1234);
  });

  it("stops forwarding progress after the export fails", async () => {
    let exportId;
    const callBridge = vi.fn(async (_method, payload) => {
      exportId = payload.exportId;
      throw new Error("Native failure");
    });
    const { androidApkExport, target } = createExport({ callBridge });
    const onProgress = vi.fn();

    await expect(
      androidApkExport.createAndroidApkToPath(
        exportRequest({ options: { onProgress } }),
      ),
    ).rejects.toThrow("Native failure");

    target.__routeVNApkExportProgress({
      exportId,
      phase: "writeApk",
      current: 1,
      total: 2,
    });
    expect(onProgress).not.toHaveBeenCalled();
  });

  it("rejects unsafe file ids before calling native code", async () => {
    const callBridge = vi.fn();
    const { androidApkExport } = createExport({ callBridge });

    await expect(
      androidApkExport.createAndroidApkToPath(
        exportRequest({ iconFileId: "../icon" }),
      ),
    ).rejects.toThrow("Unsafe file id");
    expect(callBridge).not.toHaveBeenCalled();
  });

  it("reports availability and treats bridge failures as unavailable", async () => {
    const available = createExport({
      callBridge: async () => ({ available: true }),
    }).androidApkExport;
    await expect(available.getAndroidExportAvailability()).resolves.toEqual({
      available: true,
      reason: undefined,
    });

    const failing = createExport({
      callBridge: async () => {
        throw new Error("Bridge closed");
      },
    }).androidApkExport;
    await expect(failing.getAndroidExportAvailability()).resolves.toEqual({
      available: false,
      reason: "Bridge closed",
    });
  });

  it("prompts for an APK destination", async () => {
    const saveFilePicker = vi.fn(async () => "content://documents/game.apk");
    const { androidApkExport } = createExport({ callBridge: vi.fn() });

    await androidApkExport.promptAndroidApkPath({
      defaultFileName: "Project One-1.2.3-unsigned.apk",
      options: { title: "Save", fileTypeName: "APK" },
      filePicker: { saveFilePicker },
    });

    expect(saveFilePicker).toHaveBeenCalledWith({
      title: "Save",
      defaultPath: "Project One-1.2.3-unsigned.apk",
      filters: [{ name: "APK", extensions: ["apk"] }],
      mimeType: ANDROID_APK_MIME_TYPE,
    });
  });
});
