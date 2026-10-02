import { describe, expect, it } from "vitest";
import {
  describeError,
  withErrorDetails,
} from "../../src/internal/errorDetails.js";

describe("describeError", () => {
  it("names errors whose type adds information", () => {
    expect(
      describeError(
        Object.assign(new Error("The request is not allowed."), {
          name: "NotAllowedError",
        }),
      ),
    ).toBe("NotAllowedError: The request is not allowed.");
    expect(describeError(new Error("Plain failure"))).toBe("Plain failure");
  });

  it("describes DOMException-like objects and non-error values", () => {
    expect(
      describeError({ name: "AbortError", message: "The play() was aborted." }),
    ).toBe("AbortError: The play() was aborted.");
    expect(describeError("Decoder unavailable")).toBe("Decoder unavailable");
    expect(describeError({ code: "busy", detail: 3 })).toBe(
      '{"code":"busy","detail":3}',
    );
    expect(describeError(new Error("   "))).toBe("Error");
  });

  it("never throws on values that cannot be stringified", () => {
    const circular = { code: "loop" };
    circular.self = circular;
    expect(describeError(circular)).toBe("[object Object]");
    expect(describeError({ size: 1n })).toBe("[object Object]");
    expect(describeError({ toJSON: () => undefined })).toBe("[object Object]");
  });

  it("stops at a missing or repeated cause", () => {
    expect(describeError(new Error("Failed", { cause: null }))).toBe("Failed");
    const error = new Error("Loops");
    error.cause = error;
    expect(describeError(error)).toBe("Loops");
  });

  it("adds up to two causes", () => {
    const error = new Error("Could not start", {
      cause: new TypeError("Missing stream", {
        cause: new RangeError("Bad rate", { cause: new Error("Too deep") }),
      }),
    });

    expect(describeError(error)).toBe(
      "Could not start\nTypeError: Missing stream\nRangeError: Bad rate",
    );
  });
});

describe("withErrorDetails", () => {
  it("appends the description under a label", () => {
    expect(
      withErrorDetails("Preview stopped.", new Error("Boom"), "詳細："),
    ).toBe("Preview stopped.\n\n詳細：\nBoom");
  });

  it("leaves the message alone without an error", () => {
    expect(withErrorDetails("Preview stopped.", undefined, "Details:")).toBe(
      "Preview stopped.",
    );
  });
});
