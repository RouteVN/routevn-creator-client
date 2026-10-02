import { describe, expect, it } from "vitest";
import {
  describeError,
  isMediaActivationRequired,
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

  it("never throws on values whose conversions or getters throw", () => {
    const bare = Object.create(null);
    bare.self = bare;
    expect(describeError(bare)).toBe("Unknown error");
    const throwingMessage = {
      get message() {
        throw new Error("getter");
      },
    };
    expect(describeError(throwingMessage)).toBe("Unknown error");
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(describeError(proxy)).toBe("Unknown error");
    const throwingCause = new Error("Failed");
    Object.defineProperty(throwingCause, "cause", {
      get() {
        throw new Error("getter");
      },
    });
    expect(describeError(throwingCause)).toBe("Failed");
  });

  it("keeps each line short and on one line", () => {
    const line = describeError(new Error(`Bad input:\n${"x".repeat(400)}`));
    expect(line).toBe(`Bad input: ${"x".repeat(289)}…`);
    expect(line).not.toContain("\n");
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

describe("isMediaActivationRequired", () => {
  it("matches only a start refused for lack of a gesture", () => {
    expect(isMediaActivationRequired({ name: "NotAllowedError" })).toBe(true);
    expect(isMediaActivationRequired({ name: "AbortError" })).toBe(false);
    expect(isMediaActivationRequired(undefined)).toBe(false);
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
