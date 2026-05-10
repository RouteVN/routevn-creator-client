import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setAnimations,
  setFormValues,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";

describe("commandLineScreen.store", () => {
  it("uses the current screen animation as the initial form value", () => {
    const state = createInitialState();

    const viewData = selectViewData({
      state,
      props: {
        screen: {
          animations: {
            resourceId: "screen-crossfade",
          },
        },
      },
    });

    expect(viewData.formKey).toBe("screen-crossfade");
    expect(viewData.defaultValues.transitionAnimationId).toBe(
      "screen-crossfade",
    );
    expect(viewData.form.fields[0]).toEqual(
      expect.objectContaining({
        label: "Animation",
        placeholder: "Animation",
      }),
    );
  });

  it("offers transition animations for the screen transition picker", () => {
    const state = createInitialState();

    setAnimations(
      { state },
      {
        animations: {
          items: {
            "fade-in": {
              id: "fade-in",
              type: "animation",
              name: "Fade In",
              animation: {
                type: "transition",
              },
            },
            "pulse-update": {
              id: "pulse-update",
              type: "animation",
              name: "Pulse",
              animation: {
                type: "update",
              },
            },
          },
          tree: [{ id: "fade-in" }, { id: "pulse-update" }],
        },
      },
    );
    setFormValues(
      { state },
      {
        values: {
          transitionAnimationId: "fade-in",
        },
      },
    );

    const viewData = selectViewData({ state, props: {} });

    expect(viewData.context.transitionAnimationOptions).toEqual([
      {
        value: "fade-in",
        label: "Fade In",
      },
    ]);
    expect(viewData.defaultValues.transitionAnimationId).toBe("fade-in");
  });
});
