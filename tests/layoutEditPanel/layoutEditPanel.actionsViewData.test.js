import { describe, expect, it } from "vitest";
import { toInspectorValues } from "../../src/components/layoutEditPanel/support/layoutEditPanelViewData.js";

describe("layoutEditPanel action view data", () => {
  it("labels resetStoryAtSection actions for layout editor interaction lists", () => {
    const values = toInspectorValues({
      values: {
        click: {
          payload: {
            actions: {
              resetStoryAtSection: {
                sectionId: "section-1",
              },
            },
          },
        },
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.actions).toContainEqual({
      id: "resetStoryAtSection",
      interactionType: "click",
      label: "Click: Reset Story At Section",
      svg: "action-resetStoryAtSection",
    });
  });
});
