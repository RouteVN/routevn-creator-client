// The Android export shows a list of steps instead of one progress bar that
// starts over at each phase. The exporter reports many short phases; each
// belongs to one of a few steps the creator can follow. APK and App Bundle
// exports share the steps; only some labels differ.

const STEP_BY_PHASE = {
  prepareApk: "prepare",
  prepareBundle: "prepare",
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
  // A bundle is signed before it is written, then written and checked.
  signBundle: "sign",
  writeBundle: "save",
  verifyBundle: "save",
  finalizeApk: "save",
  finalizeBundle: "save",
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

const BUNDLE_STEP_LABEL_KEYS = {
  ...STEP_LABEL_KEYS,
  build: "androidBuildBundleStep",
  sign: "androidSignBundleStep",
  save: "androidSaveBundleStep",
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
  "verifyBundle",
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

// Each step's label, for the progress dialog. `format` is `apk` or `aab`.
export const getAndroidApkExportStepLabels = (copy, format = "apk") =>
  Object.fromEntries(
    Object.entries(
      format === "aab" ? BUNDLE_STEP_LABEL_KEYS : STEP_LABEL_KEYS,
    ).map(([step, key]) => [step, copy[key]]),
  );
