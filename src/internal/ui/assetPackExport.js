import { createAssetPackageManifest } from "../assetPackageManifest.js";
import { formatI18nCopy } from "./i18nCopy.js";

// The pack's name, as a file name.
const toZipFileName = (name) =>
  `${(name ?? "").trim().replace(/[\\/:*?"<>|]+/g, "-") || "asset-package"}.zip`;

// Exports an asset pack as a zip: checks what it carries, asks where to save
// it, writes it and says where it went. `getContents` reads what the pack
// carries; it can throw as the manifest does when the picks cannot be
// exported.
export const exportAssetPack = async ({
  appService,
  i18n,
  projectService,
  getContents,
  name,
}) => {
  const copy = i18n.assetPackagePage;
  let manifest;
  try {
    manifest = createAssetPackageManifest(getContents());
  } catch (error) {
    console.error("[asset-package] Asset package export is invalid.", error);
    let message = copy.failedDownloadAssetPackage;
    if (error.code === "no_resources") {
      message = copy.selectResourcesBeforeExport;
    }
    appService.showToast({
      message,
      status: "error",
    });
    return;
  }

  let outputPath;
  try {
    outputPath = await appService.saveFilePicker({
      title: copy.saveAssetPackageTitle,
      defaultPath: toZipFileName(name),
      filters: [{ name: copy.zipFileTypeName, extensions: ["zip"] }],
    });
  } catch (error) {
    console.error("[asset-package] Failed to choose an export path.", error);
    appService.showToast({
      message: copy.failedDownloadAssetPackage,
      status: "error",
    });
    return;
  }

  if (!outputPath) {
    return;
  }

  const progressDialog = appService.showProgressDialog({
    title: copy.exportInProgressTitle,
    message: copy.exportInProgressMessage,
    status: copy.exportPreparingStatus,
    progress: {},
  });

  try {
    await progressDialog.waitForPaint();
    const bundle = await projectService.createAssetPackageBundle({ manifest });
    progressDialog.update({
      status: copy.exportSavingStatus,
      progress: {},
    });
    const savedPath = await appService.writeFile(outputPath, bundle);
    progressDialog.close();
    appService.showAlert({
      title: copy.exportCompletedTitle,
      message: formatI18nCopy(copy.exportCompletedMessage, {
        path: savedPath ?? outputPath,
      }),
    });
  } catch (error) {
    progressDialog.close();
    console.error("[asset-package] Failed to export asset package.", error);
    appService.showToast({
      message: copy.failedDownloadAssetPackage,
      status: "error",
    });
  }
};
