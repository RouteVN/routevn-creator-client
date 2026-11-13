import { withErrorDetails } from "../../../internal/errorDetails.js";

// The iOS export shows the same kind of step list as the Android export. The
// exporter reports its phases. A build installed on a device is not saved.

const STEP_BY_PHASE = {
  prepareApplication: "prepare",
  scanAssets: "pack",
  optimizeImages: "pack",
  writePackage: "pack",
  encryptPayload: "pack",
  compileAssets: "build",
  signApplication: "sign",
  saveApplication: "save",
  uploadApplication: "upload",
  installApplication: "install",
};

const STEP_LABEL_KEYS = {
  prepare: "iosPrepareProjectStep",
  pack: "iosPackGameStep",
  build: "iosBuildAppStep",
  sign: "iosSignAppStep",
  save: "iosSaveAppStep",
  upload: "iosUploadAppStep",
  install: "iosInstallAppStep",
};

export const getIosExportSteps = ({ upload, install }) => {
  const steps = ["prepare", "pack", "build", "sign"];
  steps.push(install ? "install" : "save");
  if (upload) steps.push("upload");
  return steps;
};

export const getIosExportStepForPhase = (phase) => STEP_BY_PHASE[phase];

// Each step's label, for the progress dialog.
export const getIosExportStepLabels = (copy) =>
  Object.fromEntries(
    Object.entries(STEP_LABEL_KEYS).map(([step, key]) => [step, copy[key]]),
  );

// The message for an export failure the exporter could name.
const ERROR_MESSAGE_KEYS = {
  "xcode-unavailable": "iosXcodeNotReady",
  "template-invalid": "iosExportUnavailable",
  "team-not-signed-in": "iosTeamNotSignedIn",
  "team-cannot-distribute": "iosTeamCannotDistribute",
  "signing-failed": "iosSigningFailed",
  "app-record-missing": "iosAppRecordMissing",
  "agreement-required": "iosAgreementRequired",
  "build-number-used": "iosBuildNumberUsed",
  "version-closed": "iosVersionClosed",
  "upload-failed": "iosUploadFailed",
  "device-not-registered": "iosDeviceNotRegistered",
  "device-unavailable": "iosDeviceUnavailable",
  "install-failed": "iosInstallFailed",
};

export const getIosExportErrorMessage = (error, copy) =>
  copy[ERROR_MESSAGE_KEYS[error?.code]] ?? copy.iosExportFailed;

// The alert text for a failed export. The exporter's errors carry Xcode's
// own lines, which stay as lines: the general error description would join
// them into one and shorten it. Other errors get the general description.
export const withIosExportErrorDetails = (message, error, detailsLabel) => {
  const exporterError =
    typeof error?.code === "string" && typeof error.message === "string";
  if (!exporterError || !error.message.trim()) {
    return withErrorDetails(message, error, detailsLabel);
  }
  return `${message}\n\n${detailsLabel}\n${error.message.trim()}`;
};
