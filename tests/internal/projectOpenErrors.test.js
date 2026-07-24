import { describe, expect, it } from "vitest";
import { getProjectOpenErrorMessage } from "../../src/internal/projectOpenErrors.js";

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
});
