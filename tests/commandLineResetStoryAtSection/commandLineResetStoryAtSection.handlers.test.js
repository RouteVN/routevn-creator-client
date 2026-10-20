import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectSubmitData,
  selectViewData,
  setFormValues,
  setScenes,
} from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.store.js";
import {
  handleFormChange,
  handleSubmitClick,
} from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.handlers.js";
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
  const SCENES = {
    items: {
      "scene-1": {
        id: "scene-1",
        type: "scene",
        sections: { items: { "section-2": { id: "section-2" } } },
      },
    },
  };

  const submit = (values) => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();
    const showAlert = vi.fn();
    setScenes({ state }, { scenes: SCENES });
    setFormValues({ state }, { values: values });
    handleSubmitClick({
      appService: { showAlert },
      dispatchEvent,
      i18n: EN_I18N,
      store: {
        selectSubmitData: () => selectSubmitData({ state }),
      },
    });
    return { dispatchEvent, showAlert };
  };

  it("removes the action when the scene and section are cleared", () => {
    const { dispatchEvent, showAlert } = submit({
      transitionAnimationId: "screen-crossfade",
    });

    expect(showAlert).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe("action-delete");
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      actionType: "resetStoryAtSection",
    });
  });

  it("still asks for a section when only the scene is set", () => {
    const { dispatchEvent, showAlert } = submit({ sceneId: "scene-1" });

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith({
      message: "Please select a section",
      title: "Warning",
    });
  });

  it("clears the section when the scene is cleared", () => {
    const setValues = vi.fn();
    const store = { setFormValues: vi.fn() };

    handleFormChange(
      {
        store,
        render: vi.fn(),
        refs: { form: { setValues } },
      },
      {
        _event: {
          detail: { values: { sceneId: undefined, sectionId: "section-2" } },
        },
      },
    );

    expect(setValues).toHaveBeenCalledWith({
      values: { sectionId: undefined },
    });
    expect(store.setFormValues).toHaveBeenCalledWith({
      values: { sceneId: undefined, sectionId: undefined },
    });
  });

  it("lists no sections while the scene is cleared", () => {
    const state = createInitialState();
    setScenes({ state }, { scenes: SCENES });
    setFormValues({ state }, { values: { sceneId: undefined } });

    const viewData = selectViewData({
      state,
      props: { currentSceneId: "scene-1" },
      i18n: EN_I18N,
    });

    expect(viewData.context.sectionOptions).toEqual([]);
  });
});
