import { generateId } from "../../../internal/id.js";
import { normalizeAndroidBackgroundColor } from "../../../internal/androidExport.js";
import { normalizeExportFileEntries } from "./projectExportService.js";

export const ANDROID_APK_MIME_TYPE = "application/vnd.android.package-archive";

export const ANDROID_BUNDLE_MIME_TYPE = "application/octet-stream";
export const ANDROID_KEYSTORE_MIME_TYPE = "application/x-pkcs12";

// Android export on the Android and iOS Creator apps: APKs, App Bundles, and
// the project's signing keys. Both hosts run the same Rust exporter behind
// the bridge, and stream export progress through `progressClient`.
//
// The hosts read and write a keystore file as base64: `encodeBase64` turns
// the bytes of a picked file into it, and `discardSaveDocument` removes the
// empty document Android creates when a save location is chosen.
export const createMobileAndroidApkExport = ({
  callBridge,
  progressClient,
  resolveProjectId,
  assertSafeFileId,
  encodeBase64,
  discardSaveDocument = async () => {},
}) => {
  // `bundleAvailable` tells whether the App Bundle template is installed
  // too.
  const getAndroidExportAvailability = async () => {
    try {
      const result = await callBridge("getAndroidExportAvailability", {});
      const available = result?.available === true;
      return {
        available,
        reason: result?.reason,
        bundleAvailable: available && result?.bundleAvailable === true,
      };
    } catch (error) {
      return { available: false, reason: String(error?.message ?? error) };
    }
  };

  const promptAndroidApkPath = ({
    defaultFileName,
    options = {},
    filePicker,
  }) =>
    filePicker.saveFilePicker({
      title: options.title ?? "Save Android APK",
      defaultPath: defaultFileName,
      filters: [
        { name: options.fileTypeName ?? "Android APK", extensions: ["apk"] },
      ],
      mimeType: ANDROID_APK_MIME_TYPE,
    });

  const promptAndroidBundlePath = ({
    defaultFileName,
    options = {},
    filePicker,
  }) =>
    filePicker.saveFilePicker({
      title: options.title ?? "Save Android App Bundle",
      defaultPath: defaultFileName,
      filters: [
        {
          name: options.fileTypeName ?? "Android App Bundle",
          extensions: ["aab"],
        },
      ],
      mimeType: ANDROID_BUNDLE_MIME_TYPE,
    });

  // Runs `method` with the export payload both formats share.
  const exportToUri = async (
    method,
    {
      projectData,
      fileEntries,
      outputPath,
      applicationId,
      applicationName,
      versionName,
      versionCode,
      orientation,
      iconFileId,
      adaptiveIconFileId,
      splashIconFileId,
      iconBackgroundColor,
      splashBackgroundColor,
      signingKey,
      options = {},
      getCurrentReference,
    },
  ) => {
    const exportId = generateId();
    const payload = {
      projectId: resolveProjectId(getCurrentReference()),
      uri: outputPath,
      exportId,
      fileEntries: normalizeExportFileEntries(fileEntries).map((fileEntry) => {
        const entry = { id: assertSafeFileId(fileEntry.id) };
        if (fileEntry.mimeType) {
          entry.mimeType = fileEntry.mimeType;
        }
        return entry;
      }),
      instructionsJson: JSON.stringify(projectData),
      applicationId,
      applicationName: applicationName.trim(),
      versionName,
      versionCode,
      orientation,
      iconFileId: assertSafeFileId(iconFileId),
      iconBackgroundColor: normalizeAndroidBackgroundColor(iconBackgroundColor),
      splashBackgroundColor: normalizeAndroidBackgroundColor(
        splashBackgroundColor,
      ),
    };

    if (adaptiveIconFileId != null) {
      payload.adaptiveIconFileId = assertSafeFileId(adaptiveIconFileId);
    }
    if (splashIconFileId != null) {
      payload.splashIconFileId = assertSafeFileId(splashIconFileId);
    }
    if (signingKey) {
      payload.signingKey = signingKey;
    }

    const unsubscribe = progressClient.subscribe({
      exportId,
      onProgress: options.onProgress,
    });
    try {
      const result = await callBridge(method, payload);
      return { ...result, outputPath: result?.uri ?? outputPath };
    } finally {
      unsubscribe();
    }
  };

  // An APK is signed with `signingKey` when the request has one.
  const createAndroidApkToPath = (request) =>
    exportToUri("exportAndroidApkToUri", request);

  // An App Bundle is always signed: Google Play registers its key as the
  // upload key.
  const createAndroidBundleToPath = async (request) => {
    if (!request.signingKey) {
      throw new Error("An Android App Bundle needs a signing key.");
    }
    return exportToUri("exportAndroidBundleToUri", request);
  };

  const createAndroidSigningKey = ({ applicationName, applicationId }) =>
    callBridge("createAndroidSigningKey", { applicationName, applicationId });

  // Any file can be picked: keystore files have no type the system pickers
  // agree on, and reading a file that is not a keystore says so.
  const promptAndroidKeystore = async ({ options = {}, filePicker }) => {
    const file = await filePicker.openFilePicker({
      title: options.title,
      multiple: false,
    });
    if (!file) return undefined;
    return { name: file.name, file };
  };

  const readAndroidKeystore = async ({ keystore, password, alias }) => {
    const request = {
      keystore: encodeBase64(new Uint8Array(await keystore.file.arrayBuffer())),
      password,
    };
    if (alias !== undefined) {
      request.alias = alias;
    }
    return callBridge("readAndroidKeystore", request);
  };

  const promptAndroidKeyCopyPath = async ({
    defaultFileName,
    options = {},
    filePicker,
  }) =>
    (await filePicker.saveFilePicker({
      title: options.title,
      defaultPath: defaultFileName,
      filters: [
        { name: options.fileTypeName ?? "PKCS #12", extensions: ["p12"] },
      ],
      mimeType: ANDROID_KEYSTORE_MIME_TYPE,
    })) ?? undefined;

  const writeAndroidKeystore = async ({ path, password, alias, key }) => {
    let encoded;
    try {
      encoded = await callBridge("encodeAndroidKeystore", {
        key,
        password,
        alias,
      });
    } catch (error) {
      await discardSaveDocument(path);
      throw error;
    }
    await callBridge("writeFileToUri", {
      uri: path,
      mimeType: ANDROID_KEYSTORE_MIME_TYPE,
      base64: encoded.keystore,
    });
  };

  return {
    getAndroidExportAvailability,
    promptAndroidApkPath,
    createAndroidApkToPath,
    promptAndroidBundlePath,
    createAndroidBundleToPath,
    createAndroidSigningKey,
    promptAndroidKeystore,
    readAndroidKeystore,
    promptAndroidKeyCopyPath,
    writeAndroidKeystore,
  };
};
