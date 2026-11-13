// The Android export shows a list of steps instead of one progress bar that
// starts over at each phase. The exporter reports many short phases; each
// belongs to one of a few steps the creator can follow.

const STEP_BY_PHASE = {
  prepareApk: "prepare",
  scanAssets: "pack",
  optimizeImages: "pack",
  writePackage: "pack",
  encryptPayload: "pack",
  rewriteManifest: "build",
  renderIcons: "build",
  writeApk: "build",
  verifyApk: "build",
  signApk: "sign",
  verifySignature: "sign",
  finalizeApk: "save",
  // The Android Creator copies the APK to the chosen location last.
  saveApk: "save",
};

const STEP_LABEL_KEYS = {
  createKey: "androidCreateKeyStep",
  prepare: "androidPrepareProjectStep",
  pack: "androidPackGameStep",
  build: "androidBuildApkStep",
  sign: "androidSignApkStep",
  save: "androidSaveApkStep",
};

export const getAndroidApkExportSteps = ({ signed, createsKey }) => {
  const steps = [];
  if (createsKey) steps.push("createKey");
  steps.push("prepare", "pack", "build");
  if (signed) steps.push("sign");
  steps.push("save");
  return steps;
};

export const getAndroidApkExportStepForPhase = (phase) => STEP_BY_PHASE[phase];

// Phases that count bytes; the others count items such as assets, images, or
// APK entries.
const BYTE_PHASES = new Set([
  "writePackage",
  "encryptPayload",
  "signApk",
  "verifySignature",
]);

// How far the running phase is, such as "12 / 423" or "120.4 MB / 450.0 MB".
// A phase that reports no total shows nothing.
export const formatAndroidApkExportProgress = (
  { phase, current, total },
  { formatBytes, formatCount },
) => {
  if (!(total > 0)) return undefined;
  const format = BYTE_PHASES.has(phase) ? formatBytes : formatCount;
  return `${format(current)} / ${format(total)}`;
};

// Steps before the current one are done, and the steps after it have not
// started. The current step shows `detail`, when there is one.
export const createAndroidApkExportStepsView = ({
  copy,
  steps,
  current,
  detail,
}) => {
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
