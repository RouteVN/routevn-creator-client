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
      svg: "settings",
    });
  });

  it("uses settings icons for generic runtime and system interaction actions", () => {
    const values = toInspectorValues({
      values: {
        click: {
          payload: {
            actions: {
              setMenuPage: {
                value: "main-menu",
              },
              toggleDialogueUI: {},
            },
          },
        },
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.actions).toContainEqual({
      id: "setMenuPage",
      interactionType: "click",
      label: "Click: Set Current Menu Page",
      svg: "settings",
    });
    expect(values.actions).toContainEqual({
      id: "toggleDialogueUI",
      interactionType: "click",
      label: "Click: Toggle Dialogue Box Visibility",
      svg: "settings",
    });
  });
});
