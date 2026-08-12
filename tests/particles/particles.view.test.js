import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("particles view", () => {
  it("hides the form preview on mobile while retaining its thumbnail canvas", () => {
    const view = readFileSync(
      new URL("../../src/pages/particles/particles.view.yaml", import.meta.url),
      "utf8",
    );
    const formDialogStart = view.indexOf("$if !isPreviewOnlyDialog:");
    const particleDialogEnd = view.indexOf(
      "rtgl-dialog#createTagDialog",
      formDialogStart,
    );
    const formDialog = view.slice(formDialogStart, particleDialogEnd);

    expect(formDialog).toContain("$if !mobileLayout:");
    expect(formDialog).toContain(
      'rtgl-view w=6fg lg-w=f d=v av=c g=md style="min-width: 0; min-height: 0;"',
    );
    expect(formDialog).toContain(
      'div#dialogCanvas aria-hidden=true style="position: fixed; left: -10000px; top: -10000px; width: 1px; height: 1px; opacity: 0; pointer-events: none;"',
    );
  });
});
