import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobileSheet view", () => {
  it("uses a surface panel with neutral black transparency for the overlay layer", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/mobileSheet/mobileSheet.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("background: rgba(0, 0, 0, 0.42);");
    expect(view).toContain("rtgl-view pos=fix bgc=su");
    expect(view).toContain("box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.22);");
    expect(view).not.toContain("rgba(15, 23, 42");
  });
});
