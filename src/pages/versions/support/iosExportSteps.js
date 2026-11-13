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

// Steps before the current one are done, and the steps after it have not
// started. The current step shows `detail`, when there is one.
export const createIosExportStepsView = ({ copy, steps, current, detail }) => {
  const currentIndex = steps.indexOf(current);
  return steps.map((step, index) => {
    const row = { label: copy[STEP_LABEL_KEYS[step]], state: "pending" };
    if (index < currentIndex) row.state = "done";
    if (index === currentIndex) {
      row.state = "active";
      if (detail !== undefined) row.detail = detail;
    }
    return row;
  });
};

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
