import { describe, expect, it } from "vitest";
import { isGraphicsUnavailableError } from "../../src/internal/graphicsErrors.js";

describe("isGraphicsUnavailableError", () => {
  it("recognizes the failure to create a WebGL context", () => {
    expect(
      isGraphicsUnavailableError(
        new Error(
          "This browser does not support WebGL. Try using the canvas renderer",
        ),
      ),
    ).toBe(true);
    expect(
      isGraphicsUnavailableError(
        new Error("No available renderer for the current environment"),
      ),
    ).toBe(true);
  });

  it("recognizes a device with no WebGL at all", () => {
    // Pixi finds no WebGL, reaches for its canvas renderer and fails.
    expect(
      isGraphicsUnavailableError(
        new Error("CanvasRenderer is not yet implemented"),
      ),
    ).toBe(true);
  });

  it("finds it behind a wrapping error and in a bare string", () => {
    const wrapped = new Error("Initialize graphics failed.", {
      cause: new Error("This browser does not support WebGL."),
    });

    expect(isGraphicsUnavailableError(wrapped)).toBe(true);
    expect(
      isGraphicsUnavailableError("This browser does not support WebGL."),
    ).toBe(true);
  });

  it("does not take other graphics failures for a missing WebGL", () => {
    expect(isGraphicsUnavailableError(undefined)).toBe(false);
    expect(isGraphicsUnavailableError(null)).toBe(false);
    expect(isGraphicsUnavailableError(new Error("Initialization failed"))).toBe(
      false,
    );
    expect(
      isGraphicsUnavailableError(new Error("Unable to load asset image-one.")),
    ).toBe(false);
    expect(isGraphicsUnavailableError({ message: 7 })).toBe(false);
  });

  it("does not loop on a cause that points back at the error", () => {
    const error = new Error("Failed.");
    error.cause = error;

    expect(isGraphicsUnavailableError(error)).toBe(false);
  });
});
