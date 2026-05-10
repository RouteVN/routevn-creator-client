import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setFormValues,
  setScenes,
} from "../../src/components/commandLineSectionTransition/commandLineSectionTransition.store.js";
import { handleSubmitClick } from "../../src/components/commandLineSectionTransition/commandLineSectionTransition.handlers.js";

describe("commandLineSectionTransition.handlers", () => {
  it("submits sectionTransition with an optional screen transition", () => {
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
        sceneId: "scene-1",
        sectionId: "section-2",
        transitionAnimationId: "screen-crossfade",
      },
    );

    handleSubmitClick({
      appService: {
        showAlert: vi.fn(),
      },
      dispatchEvent,
      store: {
        getState: () => state,
      },
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      sectionTransition: {
        sceneId: "scene-1",
        sectionId: "section-2",
        screen: {
          animations: {
            resourceId: "screen-crossfade",
          },
        },
      },
    });
  });
});
