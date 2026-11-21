import { describe, expect, it, vi } from "vitest";
import { createApkExportProgressClient } from "../../src/deps/clients/apkExportProgress.js";
import {
  ANDROID_APK_MIME_TYPE,
  ANDROID_BUNDLE_MIME_TYPE,
  ANDROID_KEYSTORE_MIME_TYPE,
  createMobileAndroidApkExport,
} from "../../src/deps/services/shared/mobileAndroidApkExport.js";

const SIGNING_KEY = {
  certificateSha256: "1".repeat(64),
  certificate: "Y2VydGlmaWNhdGU=",
  privateKey: "cHJpdmF0ZSBrZXk=",
};

const createExport = ({
  callBridge,
  target = {},
  discardSaveDocument,
} = {}) => {
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
      encodeBase64: (bytes) => `base64:${[...bytes].join(",")}`,
      discardSaveDocument,
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

  it("validates and sends optional icon ids", async () => {
    const callBridge = vi.fn(async () => ({}));
    const { androidApkExport } = createExport({ callBridge });
    await androidApkExport.createAndroidApkToPath(
      exportRequest({
        adaptiveIconFileId: "adaptive-1",
        splashIconFileId: "splash-1",
      }),
    );
    expect(callBridge.mock.calls[0][1]).toMatchObject({
      adaptiveIconFileId: "adaptive-1",
      splashIconFileId: "splash-1",
    });
    for (const override of [
      { adaptiveIconFileId: "../bad" },
      { splashIconFileId: "../bad" },
    ]) {
      await expect(
        androidApkExport.createAndroidApkToPath(exportRequest(override)),
      ).rejects.toThrow("Unsafe file id");
    }
    expect(callBridge).toHaveBeenCalledTimes(1);
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
      bundleAvailable: false,
    });

    const withBundle = createExport({
      callBridge: async () => ({ available: true, bundleAvailable: true }),
    }).androidApkExport;
    await expect(withBundle.getAndroidExportAvailability()).resolves.toEqual({
      available: true,
      reason: undefined,
      bundleAvailable: true,
    });

    // A host without the APK template exports no bundle either.
    const unavailable = createExport({
      callBridge: async () => ({ available: false, bundleAvailable: true }),
    }).androidApkExport;
    await expect(unavailable.getAndroidExportAvailability()).resolves.toEqual({
      available: false,
      reason: undefined,
      bundleAvailable: false,
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

  it("signs an APK with the project key the request carries", async () => {
    const callBridge = vi.fn(async () => ({
      uri: "content://documents/saved.apk",
      signingCertificateSha256: SIGNING_KEY.certificateSha256,
    }));
    const { androidApkExport } = createExport({ callBridge });

    await androidApkExport.createAndroidApkToPath(
      exportRequest({ signingKey: SIGNING_KEY }),
    );
    expect(callBridge.mock.calls[0][0]).toBe("exportAndroidApkToUri");
    expect(callBridge.mock.calls[0][1].signingKey).toEqual(SIGNING_KEY);

    await androidApkExport.createAndroidApkToPath(exportRequest());
    expect(callBridge.mock.calls[1][1]).not.toHaveProperty("signingKey");
  });

  it("exports an App Bundle only with a signing key", async () => {
    const callBridge = vi.fn(async () => ({
      uri: "content://documents/saved.aab",
      bundleBytes: 4321,
    }));
    const { androidApkExport } = createExport({ callBridge });

    await expect(
      androidApkExport.createAndroidBundleToPath(exportRequest()),
    ).rejects.toThrow("needs a signing key");
    expect(callBridge).not.toHaveBeenCalled();

    const result = await androidApkExport.createAndroidBundleToPath(
      exportRequest({
        outputPath: "content://documents/game.aab",
        signingKey: SIGNING_KEY,
      }),
    );
    expect(callBridge).toHaveBeenCalledTimes(1);
    const [method, payload] = callBridge.mock.calls[0];
    expect(method).toBe("exportAndroidBundleToUri");
    expect(payload.uri).toBe("content://documents/game.aab");
    expect(payload.signingKey).toEqual(SIGNING_KEY);
    expect(result).toEqual({
      uri: "content://documents/saved.aab",
      bundleBytes: 4321,
      outputPath: "content://documents/saved.aab",
    });
  });

  it("prompts for an App Bundle destination", async () => {
    const saveFilePicker = vi.fn(async () => "content://documents/game.aab");
    const { androidApkExport } = createExport({ callBridge: vi.fn() });

    await expect(
      androidApkExport.promptAndroidBundlePath({
        defaultFileName: "Project One-1.2.3.aab",
        options: { title: "Save", fileTypeName: "AAB" },
        filePicker: { saveFilePicker },
      }),
    ).resolves.toBe("content://documents/game.aab");
    expect(saveFilePicker).toHaveBeenCalledWith({
      title: "Save",
      defaultPath: "Project One-1.2.3.aab",
      filters: [{ name: "AAB", extensions: ["aab"] }],
      mimeType: ANDROID_BUNDLE_MIME_TYPE,
    });
  });

  it("makes a signing key in the host", async () => {
    const callBridge = vi.fn(async () => SIGNING_KEY);
    const { androidApkExport } = createExport({ callBridge });

    await expect(
      androidApkExport.createAndroidSigningKey({
        applicationName: "Project One",
        applicationId: "com.example.game",
      }),
    ).resolves.toEqual(SIGNING_KEY);
    expect(callBridge).toHaveBeenCalledWith("createAndroidSigningKey", {
      applicationName: "Project One",
      applicationId: "com.example.game",
    });
  });

  it("reads the key in a picked keystore file", async () => {
    const callBridge = vi.fn(async () => SIGNING_KEY);
    const { androidApkExport } = createExport({ callBridge });
    const file = new File([new Uint8Array([1, 2, 3])], "Project One.p12");
    const openFilePicker = vi.fn(async () => file);

    const keystore = await androidApkExport.promptAndroidKeystore({
      options: { title: "Choose a keystore" },
      filePicker: { openFilePicker },
    });
    expect(openFilePicker).toHaveBeenCalledWith({
      title: "Choose a keystore",
      multiple: false,
    });
    expect(keystore).toEqual({ name: "Project One.p12", file });

    await expect(
      androidApkExport.readAndroidKeystore({
        keystore,
        password: "pass one",
        alias: "upload",
      }),
    ).resolves.toEqual(SIGNING_KEY);
    expect(callBridge).toHaveBeenCalledWith("readAndroidKeystore", {
      keystore: "base64:1,2,3",
      password: "pass one",
      alias: "upload",
    });

    await androidApkExport.readAndroidKeystore({
      keystore,
      password: "pass one",
    });
    expect(callBridge.mock.calls[1][1]).not.toHaveProperty("alias");

    openFilePicker.mockResolvedValueOnce(null);
    await expect(
      androidApkExport.promptAndroidKeystore({
        filePicker: { openFilePicker },
      }),
    ).resolves.toBeUndefined();
  });

  it("saves a copy of a key where the creator chose", async () => {
    const callBridge = vi.fn(async (method) =>
      method === "encodeAndroidKeystore" ? { keystore: "a2V5c3RvcmU=" } : true,
    );
    const { androidApkExport } = createExport({ callBridge });
    const saveFilePicker = vi.fn(async () => "content://documents/key.p12");

    const path = await androidApkExport.promptAndroidKeyCopyPath({
      defaultFileName: "Project One-signing-key.p12",
      options: { title: "Save a Copy", fileTypeName: "Keystore" },
      filePicker: { saveFilePicker },
    });
    expect(saveFilePicker).toHaveBeenCalledWith({
      title: "Save a Copy",
      defaultPath: "Project One-signing-key.p12",
      filters: [{ name: "Keystore", extensions: ["p12"] }],
      mimeType: ANDROID_KEYSTORE_MIME_TYPE,
    });

    await androidApkExport.writeAndroidKeystore({
      path,
      password: "pass one",
      alias: "key0",
      key: SIGNING_KEY,
    });
    expect(callBridge.mock.calls).toEqual([
      [
        "encodeAndroidKeystore",
        { key: SIGNING_KEY, password: "pass one", alias: "key0" },
      ],
      [
        "writeFileToUri",
        {
          uri: "content://documents/key.p12",
          mimeType: ANDROID_KEYSTORE_MIME_TYPE,
          base64: "a2V5c3RvcmU=",
        },
      ],
    ]);
  });

  it("removes the chosen document when the key cannot be encoded", async () => {
    const failure = Object.assign(new Error("The key is damaged."), {
      code: "signing-key-invalid",
    });
    const callBridge = vi.fn(async () => {
      throw failure;
    });
    const discardSaveDocument = vi.fn(async () => undefined);
    const { androidApkExport } = createExport({
      callBridge,
      discardSaveDocument,
    });

    await expect(
      androidApkExport.writeAndroidKeystore({
        path: "content://documents/key.p12",
        password: "pass one",
        alias: "key0",
        key: SIGNING_KEY,
      }),
    ).rejects.toBe(failure);
    expect(discardSaveDocument).toHaveBeenCalledWith(
      "content://documents/key.p12",
    );
    expect(callBridge).toHaveBeenCalledTimes(1);
  });
});
