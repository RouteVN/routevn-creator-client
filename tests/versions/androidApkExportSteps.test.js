import { describe, expect, it } from "vitest";
import {
  formatAndroidApkExportProgress,
  getAndroidApkExportStepForPhase,
  getAndroidApkExportStepLabels,
  getAndroidApkExportSteps,
} from "../../src/pages/versions/support/androidApkExportSteps.js";
import { createExportStepsView } from "../../src/pages/versions/support/exportStepsProgress.js";
import { EN_I18N } from "../support/i18n.js";

const copy = EN_I18N.versionsPage;

describe("Android APK export steps", () => {
  it("lists key creation and signing only when the export does them", () => {
    expect(
      getAndroidApkExportSteps({ signed: false, createsKey: false }),
    ).toEqual(["prepare", "pack", "build", "save"]);
    expect(
      getAndroidApkExportSteps({ signed: true, createsKey: false }),
    ).toEqual(["prepare", "pack", "build", "sign", "save"]);
    expect(
      getAndroidApkExportSteps({ signed: true, createsKey: true }),
    ).toEqual(["createKey", "prepare", "pack", "build", "sign", "save"]);
  });

  it("puts every exporter phase in a step, in export order", () => {
    const phases = [
      "prepareApk",
      "scanAssets",
      "optimizeImages",
      "writePackage",
      "encryptPayload",
      "rewriteManifest",
      "renderIcons",
      "writeApk",
      "verifyApk",
      "signApk",
      "verifySignature",
      "finalizeApk",
      "saveApk",
    ];
    const order = getAndroidApkExportSteps({ signed: true, createsKey: false });
    const stepIndexes = phases.map((phase) =>
      order.indexOf(getAndroidApkExportStepForPhase(phase)),
    );
    expect(stepIndexes.every((index) => index >= 0)).toBe(true);
    expect(stepIndexes).toEqual([...stepIndexes].sort((a, b) => a - b));
    expect(getAndroidApkExportStepForPhase("unknownPhase")).toBeUndefined();
  });

  it("counts items, or sizes for phases that count bytes", () => {
    const formats = {
      formatBytes: (value) => `${value / 1024 / 1024} MB`,
      formatCount: (value) => value.toLocaleString("en-US"),
    };
    expect(
      formatAndroidApkExportProgress(
        { phase: "scanAssets", current: 12, total: 1423 },
        formats,
      ),
    ).toBe("12 / 1,423");
    expect(
      formatAndroidApkExportProgress(
        { phase: "writePackage", current: 1048576, total: 4194304 },
        formats,
      ),
    ).toBe("1 MB / 4 MB");
    expect(
      formatAndroidApkExportProgress(
        { phase: "signApk", current: 2097152, total: 4194304 },
        formats,
      ),
    ).toBe("2 MB / 4 MB");
    expect(
      formatAndroidApkExportProgress(
        { phase: "verifyApk", current: 0, total: 0 },
        formats,
      ),
    ).toBeUndefined();
  });

  it("marks earlier steps done and later steps not started", () => {
    const steps = getAndroidApkExportSteps({ signed: true, createsKey: false });
    expect(
      createExportStepsView({
        labels: getAndroidApkExportStepLabels(copy),
        steps,
        current: "build",
        detail: "3 / 9",
      }),
    ).toEqual([
      { label: copy.androidPrepareProjectStep, state: "done" },
      { label: copy.androidPackGameStep, state: "done" },
      { label: copy.androidBuildApkStep, state: "active", detail: "3 / 9" },
      { label: copy.androidSignApkStep, state: "pending" },
      { label: copy.androidSaveApkStep, state: "pending" },
    ]);
  });
});
