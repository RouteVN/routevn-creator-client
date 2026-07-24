import { describe, expect, it } from "vitest";
import { getProjectOpenErrorMessage } from "../../src/internal/projectOpenErrors.js";

describe("projectOpenErrors", () => {
  it("shows the validation error and support guidance", () => {
    const error = new Error(
      "payload.sectionId must reference an existing section",
    );
    error.code = "precondition_validation_failed";

    expect(getProjectOpenErrorMessage(error)).toBe(
      "RouteVN Creator couldn't safely open this project.\n\nError: payload.sectionId must reference an existing section\n\nPlease make sure you're using the latest version of RouteVN Creator. If the problem continues, please reach out to RouteVN for support.",
    );
  });

  it("shows support guidance when validation has no error detail", () => {
    const error = new Error("");
    error.code = "state_validation_failed";

    expect(getProjectOpenErrorMessage(error)).toBe(
      "RouteVN Creator couldn't safely open this project.\n\nPlease make sure you're using the latest version of RouteVN Creator. If the problem continues, please reach out to RouteVN for support.",
    );
  });
});
