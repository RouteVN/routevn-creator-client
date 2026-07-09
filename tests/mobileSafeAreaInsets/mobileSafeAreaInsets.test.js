import { afterEach, describe, expect, it, vi } from "vitest";
import {
  configureMobileSafeAreaInsets,
  MOBILE_SAFE_AREA_INSET_BOTTOM_VAR,
  MOBILE_SAFE_AREA_INSET_TOP_VAR,
} from "../../src/internal/ui/mobileSafeAreaInsets.js";

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "document",
);

const installDocumentStyle = () => {
  const setProperty = vi.fn();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        style: {
          setProperty,
        },
      },
    },
  });
  return setProperty;
};

afterEach(() => {
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, "document", originalDocumentDescriptor);
    return;
  }

  delete globalThis.document;
});

describe("mobile safe area insets", () => {
  it("defaults mobile safe-area variables to zero", () => {
    const setProperty = installDocumentStyle();

    configureMobileSafeAreaInsets();

    expect(setProperty).toHaveBeenCalledWith(
      MOBILE_SAFE_AREA_INSET_TOP_VAR,
      "0px",
    );
    expect(setProperty).toHaveBeenCalledWith(
      MOBILE_SAFE_AREA_INSET_BOTTOM_VAR,
      "0px",
    );
  });

  it("allows iOS setup to provide native safe-area env values", () => {
    const setProperty = installDocumentStyle();

    configureMobileSafeAreaInsets({
      top: "env(safe-area-inset-top)",
      bottom: "env(safe-area-inset-bottom)",
    });

    expect(setProperty).toHaveBeenCalledWith(
      MOBILE_SAFE_AREA_INSET_TOP_VAR,
      "env(safe-area-inset-top)",
    );
    expect(setProperty).toHaveBeenCalledWith(
      MOBILE_SAFE_AREA_INSET_BOTTOM_VAR,
      "env(safe-area-inset-bottom)",
    );
  });
});
