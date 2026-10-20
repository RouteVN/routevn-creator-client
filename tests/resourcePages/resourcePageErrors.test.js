import { describe, expect, it, vi } from "vitest";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../src/internal/ui/resourcePages/resourcePageErrors.js";
import { ES_I18N, EN_I18N, FR_I18N } from "../support/i18n.js";

const runFailingMutation = async (action, copy = EN_I18N.appPage) => {
  const appService = {
    reportError: vi.fn(),
    showAlert: vi.fn(),
    getAppCopy: () => copy,
  };
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

  const outcome = await runResourcePageMutation({
    appService,
    action,
    fallbackMessage: "Failed to update resource.",
  });
  consoleError.mockRestore();

  expect(outcome.ok).toBe(false);
  expect(appService.showAlert).toHaveBeenCalledTimes(1);
  return appService;
};

describe("runResourcePageMutation", () => {
  it("reports unexpected thrown errors", async () => {
    const error = new TypeError("Cannot read properties of undefined");
    const appService = await runFailingMutation(async () => {
      throw error;
    });

    expect(appService.reportError).toHaveBeenCalledWith(error, {
      operation: "resourcePage.mutation",
    });
  });

  it("does not report unavailable project storage", async () => {
    const quotaAppService = await runFailingMutation(async () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });
    const databaseAppService = await runFailingMutation(async () => {
      throw "error returned from database: (code: 14) unable to open database file";
    });

    expect(quotaAppService.reportError).not.toHaveBeenCalled();
    expect(databaseAppService.reportError).not.toHaveBeenCalled();
  });

  it("does not report invalid results", async () => {
    const appService = await runFailingMutation(async () => ({
      valid: false,
      error: { code: "precondition_validation_failed", message: "Invalid" },
    }));

    expect(appService.reportError).not.toHaveBeenCalled();
  });

  it("tells the user to free up space when the device is full, without reporting it", async () => {
    const iosRejection = new Error(
      "You can’t save the file “photo.png” because there isn’t enough space.",
    );
    const desktopRejection = "No space left on device (os error 28)";

    const iosAppService = await runFailingMutation(async () => {
      throw iosRejection;
    });
    const desktopAppService = await runFailingMutation(async () => {
      throw desktopRejection;
    });

    for (const appService of [iosAppService, desktopAppService]) {
      expect(appService.reportError).not.toHaveBeenCalled();
      expect(appService.showAlert).toHaveBeenCalledWith({
        message: EN_I18N.appPage.storageFullMessage,
        title: "Error",
      });
    }
  });

  it("explains a full device in the app language, whatever language the system message is in", async () => {
    const error = new Error("Not enough room to save the file.");
    error.code = "storageFull";

    const appService = await runFailingMutation(async () => {
      throw error;
    }, ES_I18N.appPage);

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: ES_I18N.appPage.storageFullMessage,
      title: "Error",
    });
    expect(ES_I18N.appPage.storageFullMessage).not.toBe(
      EN_I18N.appPage.storageFullMessage,
    );
  });

  it("leads with the localized message and shows the thrown error as details", async () => {
    const appService = await runFailingMutation(async () => {
      throw new TypeError("Cannot read properties of undefined");
    }, FR_I18N.appPage);

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: `Failed to update resource.\n\n${FR_I18N.appPage.errorDetailsLabel}\nTypeError: Cannot read properties of undefined`,
      title: FR_I18N.appPage.errorTitle,
    });
    expect(FR_I18N.appPage.errorTitle).not.toBe(EN_I18N.appPage.errorTitle);
  });

  it("shows the reason of a refused result as details", async () => {
    const appService = await runFailingMutation(async () => ({
      valid: false,
      error: {
        code: "precondition_validation_failed",
        message: "payload.parentId must reference a folder variable item",
      },
    }));

    expect(appService.showAlert).toHaveBeenCalledWith({
      message:
        "Failed to update resource.\n\nDetails:\npayload.parentId must reference a folder variable item",
      title: "Error",
    });
  });

  it("shows only the localized message when there is no error", () => {
    const appService = {
      showAlert: vi.fn(),
      getAppCopy: () => FR_I18N.appPage,
    };

    showResourcePageError({
      appService,
      fallbackMessage: FR_I18N.charactersPage.failedUploadAvatarImage,
      title: FR_I18N.resourcePages.warningTitle,
    });

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: FR_I18N.charactersPage.failedUploadAvatarImage,
      title: FR_I18N.resourcePages.warningTitle,
    });
  });

  it("explains a full device found in a refused result", async () => {
    const appService = await runFailingMutation(async () => ({
      valid: false,
      error: {
        code: "write_failed",
        message: "No space left on device (os error 28)",
      },
    }));

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: EN_I18N.appPage.storageFullMessage,
      title: "Error",
    });
  });
});
