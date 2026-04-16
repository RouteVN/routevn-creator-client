import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setFormValues,
  setScenes,
} from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.store.js";
import { handleSubmitClick } from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.handlers.js";

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
      store: {
        getState: () => state,
      },
    });

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      resetStoryAtSection: {
        sectionId: "section-2",
      },
    });
  });
});
