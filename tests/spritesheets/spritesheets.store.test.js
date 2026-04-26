import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openPreviewDialog,
  selectViewData,
} from "../../src/pages/spritesheets/spritesheets.store.js";

describe("spritesheets store", () => {
  it("pauses the detail preview while the preview dialog is open", () => {
    const state = createInitialState();

    expect(selectViewData({ state }).detailPreviewPaused).toBe(false);

    openPreviewDialog({ state });

    expect(selectViewData({ state }).detailPreviewPaused).toBe(true);
  });
});
