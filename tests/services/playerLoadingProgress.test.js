import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { updatePlayerLoadingProgress } from "../../scripts/playerLoadingProgress.js";
import { BUNDLE_PLAYER_INDEX_HTML } from "../../src/deps/services/shared/projectExportService.js";

describe("player loading progress", () => {
  it("shows whole-number progress while keeping a single loading label", () => {
    const dom = new JSDOM(BUNDLE_PLAYER_INDEX_HTML);
    const loadingElement = dom.window.document.querySelector("#loading");

    for (const [loaded, total, percentage] of [
      [0, 3, 0],
      [1, 3, 33],
      [2, 3, 66],
      [3, 3, 100],
      [0, 0, 100],
    ]) {
      updatePlayerLoadingProgress(loadingElement, { loaded, total });
      expect(loadingElement.querySelector("#loading-progress").value).toBe(
        percentage,
      );
      expect(
        loadingElement.querySelector("#loading-percentage").textContent,
      ).toBe(`${percentage}%`);
      expect(loadingElement.querySelector("#loading-label").textContent).toBe(
        "Loading…",
      );
    }
    dom.window.close();
  });

  it("does not create UI in native players or overwrite an error", () => {
    const dom = new JSDOM('<div id="loading"></div>');
    const loadingElement = dom.window.document.querySelector("#loading");

    updatePlayerLoadingProgress(loadingElement, { loaded: 1, total: 2 });
    expect(loadingElement.innerHTML).toBe("");
    loadingElement.textContent = "Failed to load";
    updatePlayerLoadingProgress(loadingElement, { loaded: 2, total: 2 });
    expect(loadingElement.textContent).toBe("Failed to load");
    dom.window.close();
  });
});
