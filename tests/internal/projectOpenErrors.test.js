import { describe, expect, it } from "vitest";
import {
  getProjectOpenErrorMessage,
  isProjectStorageUnavailableError,
} from "../../src/internal/projectOpenErrors.js";

describe("projectOpenErrors", () => {
  it("shows plain-language guidance before validation details", () => {
    const error = new Error(
      "payload.sectionId must reference an existing section",
    );
    error.code = "precondition_validation_failed";

    expect(getProjectOpenErrorMessage(error)).toBe(
      "RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nPlease make sure you're using the latest version of RouteVN Creator. If the problem continues, please reach out to RouteVN for support.\n\nTechnical details: payload.sectionId must reference an existing section",
    );
  });

  it("shows support guidance when validation has no error detail", () => {
    const error = new Error("");
    error.code = "state_validation_failed";

    expect(getProjectOpenErrorMessage(error)).toBe(
      "RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nPlease make sure you're using the latest version of RouteVN Creator. If the problem continues, please reach out to RouteVN for support.",
    );
  });

  it("explains committed event ID mismatches as inconsistent history", () => {
    const error = new Error(
      "committed event invariant violation for committedId 1: id mismatch",
    );

    expect(getProjectOpenErrorMessage(error)).toBe(
      "RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nPlease make sure you're using the latest version of RouteVN Creator. If the problem continues, please reach out to RouteVN for support.\n\nTechnical details: committed event invariant violation for committedId 1: id mismatch",
    );
  });

  it("treats unavailable project storage as an expected failure", () => {
    const missingDatabase = new Error(
      "error returned from database: (code: 14) unable to open database file",
    );
    missingDatabase.code = "project_database_missing";
    const pluginRejection =
      "error returned from database: (code: 14) unable to open database file";

    expect(isProjectStorageUnavailableError(missingDatabase)).toBe(true);
    expect(isProjectStorageUnavailableError(pluginRejection)).toBe(true);
    expect(
      isProjectStorageUnavailableError(
        new DOMException("Quota exceeded", "QuotaExceededError"),
      ),
    ).toBe(true);
    expect(getProjectOpenErrorMessage(pluginRejection)).toBe(
      "Failed to open the project database. Make sure the project folder still exists and RouteVN can access it.",
    );
  });

  it("treats other project open failures as unexpected", () => {
    const validationError = new Error("state is invalid");
    validationError.code = "state_validation_failed";

    expect(isProjectStorageUnavailableError(validationError)).toBe(false);
    expect(
      isProjectStorageUnavailableError(
        new DOMException("Object store missing", "NotFoundError"),
      ),
    ).toBe(false);
    expect(
      isProjectStorageUnavailableError(new Error("project not found")),
    ).toBe(false);
    expect(isProjectStorageUnavailableError({ code: "submit_failed" })).toBe(
      false,
    );
  });
});
