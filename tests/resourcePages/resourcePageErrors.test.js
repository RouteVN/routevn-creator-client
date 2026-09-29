import { describe, expect, it, vi } from "vitest";
import { runResourcePageMutation } from "../../src/internal/ui/resourcePages/resourcePageErrors.js";

const runFailingMutation = async (action) => {
  const appService = {
    reportError: vi.fn(),
    showAlert: vi.fn(),
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
});
