import { describe, expect, it } from "vitest";
import { getIosExportErrorMessage } from "../../src/pages/versions/support/iosExportSteps.js";
import { EN_I18N } from "../support/i18n.js";

const copy = EN_I18N.versionsPage;

describe("iOS export error messages", () => {
  it("explains the failures the exporter names", () => {
    const message = (code) => getIosExportErrorMessage({ code }, copy);
    expect(message("signing-failed")).toBe(copy.iosSigningFailed);
    expect(message("timed-out")).toBe(copy.iosExportTimedOut);
    expect(message("not-enough-space")).toBe(copy.iosExportNotEnoughSpace);
    expect(message("export-failed")).toBe(copy.iosExportFailed);
    expect(getIosExportErrorMessage(new Error("unknown"), copy)).toBe(
      copy.iosExportFailed,
    );
  });

  it("explains a disk that filled up during the export", () => {
    expect(
      getIosExportErrorMessage(
        {
          code: "export-failed",
          message:
            "Failed to create the game package: No space left on device (os error 28)",
        },
        copy,
      ),
    ).toBe(copy.iosExportNotEnoughSpace);
  });

  it("has every new message in the catalog", () => {
    for (const key of [
      "iosExportTimedOut",
      "iosExportNotEnoughSpace",
      "iosExportCancellingButton",
      "iosExportCancelled",
      "iosExportCancelFailed",
    ]) {
      expect(copy[key]).toEqual(expect.any(String));
    }
  });
});
