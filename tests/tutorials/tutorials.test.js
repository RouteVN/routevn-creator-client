import { describe, expect, it, vi } from "vitest";
import { handleWatchTutorialsClick } from "../../src/pages/tutorials/tutorials.handlers.js";
import {
  createInitialState,
  selectVideoTutorialsUrl,
  setUiConfig,
} from "../../src/pages/tutorials/tutorials.store.js";

const openedTutorialsUrl = (uiConfig) => {
  const state = createInitialState();
  setUiConfig({ state }, { uiConfig });
  const deps = {
    appService: { openUrl: vi.fn() },
    store: {
      selectVideoTutorialsUrl: () => selectVideoTutorialsUrl({ state }),
    },
  };
  handleWatchTutorialsClick(deps);
  return deps.appService.openUrl.mock.calls[0][0];
};

describe("tutorials", () => {
  it("opens the desktop video tutorials with a pointer", () => {
    expect(openedTutorialsUrl({ id: "normal", inputMode: "pointer" })).toBe(
      "https://routevn.com/en/creator/docs/video-tutorials/",
    );
  });

  it("opens the mobile video tutorials in touch mode", () => {
    expect(openedTutorialsUrl({ id: "touch", inputMode: "touch" })).toBe(
      "https://routevn.com/en/creator/docs/video-tutorials-mobile/",
    );
  });
});
