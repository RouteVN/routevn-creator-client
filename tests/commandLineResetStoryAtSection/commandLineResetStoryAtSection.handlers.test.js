import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectSubmitData,
  setFormValues,
  setScenes,
} from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.store.js";
import { handleSubmitClick } from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("commandLineResetStoryAtSection.handlers", () => {
  it("submits resetStoryAtSection with a sectionId payload", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setScenes(
      { state },
      {
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              sections: {
                items: {
                  "section-2": {
                    id: "section-2",
                  },
                },
              },
            },
          },
        },
      },
    );
    setFormValues(
      { state },
      {
        values: {
          sceneId: "scene-1",
          sectionId: "section-2",
        },
      },
    );

    handleSubmitClick({
      appService: {
        showAlert: vi.fn(),
      },
      dispatchEvent,
      i18n: EN_I18N,
      store: {
        selectSubmitData: () => selectSubmitData({ state }),
      },
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      resetStoryAtSection: {
        sectionId: "section-2",
      },
    });
  });

  it("submits resetStoryAtSection with an optional screen transition", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setScenes(
      { state },
      {
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              sections: {
                items: {
                  "section-2": {
                    id: "section-2",
                  },
                },
              },
            },
          },
        },
      },
    );
    setFormValues(
      { state },
      {
        values: {
          sceneId: "scene-1",
          sectionId: "section-2",
          transitionAnimationId: "screen-mask-reveal",
        },
      },
    );

    handleSubmitClick({
      appService: {
        showAlert: vi.fn(),
      },
      dispatchEvent,
      i18n: EN_I18N,
      store: {
        selectSubmitData: () => selectSubmitData({ state }),
      },
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      resetStoryAtSection: {
        sectionId: "section-2",
        screen: {
          animations: {
            resourceId: "screen-mask-reveal",
            playback: {
              continuity: "render",
              speed: 1,
            },
          },
        },
      },
    });
  });
});
