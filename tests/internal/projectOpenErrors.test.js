import { describe, expect, it } from "vitest";
import {
  getProjectOpenErrorMessage,
  isProjectStorageUnavailableError,
} from "../../src/internal/projectOpenErrors.js";
import { EN_I18N, FR_I18N } from "../support/i18n.js";

const copy = EN_I18N.appPage;

describe("projectOpenErrors", () => {
  it("shows plain-language guidance before validation details", () => {
    const error = new Error(
      "payload.sectionId must reference an existing section",
    );
    error.code = "precondition_validation_failed";

    expect(getProjectOpenErrorMessage(error, copy)).toBe(
      "RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nMake sure you're using the latest version of RouteVN Creator. If the problem continues, contact RouteVN for support.\n\nDetails:\npayload.sectionId must reference an existing section",
    );
  });

  it("shows support guidance when validation has no error detail", () => {
    const error = new Error("");
    error.code = "state_validation_failed";

    expect(getProjectOpenErrorMessage(error, copy)).toBe(
      "RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nMake sure you're using the latest version of RouteVN Creator. If the problem continues, contact RouteVN for support.",
    );
  });

  it("explains committed event ID mismatches as inconsistent history", () => {
    const error = new Error(
      "committed event invariant violation for committedId 1: id mismatch",
    );

    expect(getProjectOpenErrorMessage(error, copy)).toBe(
      "RouteVN Creator couldn't safely open this project because its saved project history is inconsistent.\n\nMake sure you're using the latest version of RouteVN Creator. If the problem continues, contact RouteVN for support.\n\nDetails:\ncommitted event invariant violation for committedId 1: id mismatch",
    );
  });

  it("explains a failed open in the app language and keeps the raw error as details", () => {
    const frenchCopy = FR_I18N.appPage;

    expect(
      getProjectOpenErrorMessage(
        new Error("Cannot read properties of undefined"),
        frenchCopy,
      ),
    ).toBe(
      `${frenchCopy.projectOpenFailed}\n${frenchCopy.latestCreatorVersionHint}\n\n${frenchCopy.errorDetailsLabel}\nCannot read properties of undefined`,
    );
    expect(
      getProjectOpenErrorMessage(
        new Error("Client store requires reset for schema version 2"),
        frenchCopy,
      ),
    ).toBe(
      `${frenchCopy.projectOpenUnsupportedVersion}\n${frenchCopy.latestCreatorVersionHint}`,
    );
    expect(
      getProjectOpenErrorMessage(
        "error returned from database: (code: 14) unable to open database file",
        frenchCopy,
      ),
    ).toBe(frenchCopy.projectOpenDatabaseUnavailable);
    expect(frenchCopy.projectOpenFailed).not.toBe(copy.projectOpenFailed);
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
    expect(getProjectOpenErrorMessage(pluginRejection, copy)).toBe(
      "Failed to open the project database. Make sure the project folder still exists and RouteVN can access it.",
    );
  });

  it("treats a full device as an expected failure", () => {
    expect(
      isProjectStorageUnavailableError(
        new Error(
          "You can’t save the file “project.db” because there isn’t enough space.",
        ),
      ),
    ).toBe(true);
    expect(
      isProjectStorageUnavailableError(
        "error returned from database: (code: 13) database or disk is full",
      ),
    ).toBe(true);
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
