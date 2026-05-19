import { describe, expect, it } from "vitest";
import {
  createInitialState,
  hydrateForm,
  selectFormData,
  selectViewData,
  setRepositoryData,
} from "../../src/components/commandLineInput/commandLineInput.store.js";

const inputLayout = {
  id: "profile-form-layout",
  type: "layout",
  name: "Profile Form",
  layoutType: "input",
  elements: {
    items: {
      nameInput: {
        id: "nameInput",
        type: "input",
        name: "Name",
        field: "name",
        placeholder: "Name",
      },
      codeInput: {
        id: "codeInput",
        type: "input",
        name: "Code",
        field: "code",
        placeholder: "Code",
        maxLength: 8,
      },
    },
    tree: [{ id: "nameInput" }, { id: "codeInput" }],
  },
};

const layouts = [inputLayout];
const layoutsData = {
  items: {
    [inputLayout.id]: inputLayout,
  },
  tree: [{ id: inputLayout.id }],
};

const variables = {
  items: {
    playerName: {
      id: "playerName",
      type: "variable",
      name: "Player Name",
      variableType: "string",
    },
    playerCode: {
      id: "playerCode",
      type: "variable",
      name: "Player Code",
      variableType: "string",
    },
    score: {
      id: "score",
      type: "variable",
      name: "Score",
      variableType: "number",
    },
  },
  tree: [{ id: "playerName" }, { id: "playerCode" }, { id: "score" }],
};

describe("commandLineInput.store", () => {
  it("hydrates one form field mapping for every input element", () => {
    const state = createInitialState();

    setRepositoryData(
      { state },
      {
        variables,
      },
    );
    hydrateForm(
      { state },
      {
        layouts,
        layoutsData,
        form: {
          resourceId: inputLayout.id,
          fields: {
            name: {
              variableId: "playerName",
              required: true,
              trim: true,
              placeholder: "Full name",
            },
            code: {
              variableId: "playerCode",
              trim: false,
            },
          },
          submitActions: {
            nextLine: {},
          },
          cancelActions: {
            nextLine: {
              bypassChoice: true,
            },
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        layouts,
      },
    });

    expect(viewData.fieldRows.map((field) => field.field)).toEqual([
      "name",
      "code",
    ]);
    expect(viewData.fieldRows[0]).toMatchObject({
      label: "Name",
      variableId: "playerName",
      required: true,
      trim: true,
      placeholder: "Full name",
    });
    expect(viewData.fieldRows[1]).toMatchObject({
      label: "Code",
      variableId: "playerCode",
      trim: false,
      placeholder: "Code",
      maxLength: 8,
    });
    expect(viewData.fieldVariableOptions).toEqual([
      {
        label: "Player Name (string)",
        value: "playerName",
      },
      {
        label: "Player Code (string)",
        value: "playerCode",
      },
    ]);
    expect(viewData.submitDisabled).toBe(false);
    expect(selectFormData({ state })).toEqual({
      resourceId: inputLayout.id,
      cancelActions: {
        nextLine: {
          bypassChoice: true,
        },
      },
      fields: {
        name: {
          variableId: "playerName",
          required: true,
          trim: true,
          placeholder: "Full name",
        },
        code: {
          variableId: "playerCode",
          required: false,
          trim: false,
          placeholder: "Code",
          maxLength: 8,
        },
      },
      submitActions: {
        nextLine: {},
      },
    });
  });

  it("prefills section transition submit actions with animation options", () => {
    const state = createInitialState();

    setRepositoryData(
      { state },
      {
        variables,
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              type: "scene",
              name: "Opening",
              sections: {
                items: {
                  "section-2": {
                    id: "section-2",
                    type: "section",
                    name: "Profile Submitted",
                  },
                },
                tree: [{ id: "section-2" }],
              },
            },
          },
          tree: [{ id: "scene-1" }],
        },
        animations: {
          items: {
            "screen-crossfade": {
              id: "screen-crossfade",
              type: "animation",
              name: "Crossfade",
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
          tree: [{ id: "screen-crossfade" }, { id: "pulse-update" }],
        },
      },
    );
    hydrateForm(
      { state },
      {
        layouts,
        layoutsData,
        form: {
          resourceId: inputLayout.id,
          fields: {
            name: {
              variableId: "playerName",
            },
            code: {
              variableId: "playerCode",
            },
          },
          submitActions: {
            sectionTransition: {
              sceneId: "scene-1",
              sectionId: "section-2",
              screen: {
                animations: {
                  resourceId: "screen-crossfade",
                },
              },
            },
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        layouts,
      },
    });

    expect(viewData.defaultValues).toMatchObject({
      submitActionType: "sectionTransition",
      submitSceneId: "scene-1",
      submitSectionId: "section-2",
      submitTransitionAnimationId: "screen-crossfade",
    });
    expect(viewData.context.transitionAnimationOptions).toEqual([
      {
        value: "screen-crossfade",
        label: "Crossfade",
      },
    ]);
    expect(selectFormData({ state }).submitActions).toEqual({
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
