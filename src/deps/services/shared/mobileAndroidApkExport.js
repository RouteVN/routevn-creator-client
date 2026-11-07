import { generateId } from "../../../internal/id.js";
import { normalizeAndroidBackgroundColor } from "../../../internal/androidExport.js";
import { normalizeExportFileEntries } from "./projectExportService.js";

export const ANDROID_APK_MIME_TYPE = "application/vnd.android.package-archive";

// Android APK export on the Android and iOS Creator apps. Both hosts run the
// same Rust exporter behind the bridge methods `getAndroidExportAvailability`
// and `exportAndroidApkToUri`, and stream progress through `progressClient`.
export const createMobileAndroidApkExport = ({
  callBridge,
  progressClient,
  resolveProjectId,
  assertSafeFileId,
}) => {
  const getAndroidExportAvailability = async () => {
    try {
      const result = await callBridge("getAndroidExportAvailability", {});
      return {
        available: result?.available === true,
        reason: result?.reason,
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

  const createAndroidApkToPath = async ({
    projectData,
    fileEntries,
    outputPath,
    applicationId,
    applicationName,
    versionName,
    versionCode,
    orientation,
    iconFileId,
    iconBackgroundColor,
    splashBackgroundColor,
    options = {},
    getCurrentReference,
  }) => {
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

    const unsubscribe = progressClient.subscribe({
      exportId,
      onProgress: options.onProgress,
    });
    try {
      const result = await callBridge("exportAndroidApkToUri", payload);
      return { ...result, outputPath: result?.uri ?? outputPath };
    } finally {
      unsubscribe();
    }
  };

  return {
    getAndroidExportAvailability,
    promptAndroidApkPath,
    createAndroidApkToPath,
  };
};
