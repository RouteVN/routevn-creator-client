import { describe, expect, it } from "vitest";
import {
  createInitialState,
  hydrateForm,
  saveEditingField,
  selectCanSaveEditField,
  selectFormData,
  selectFormDataWithEditingDraft,
  selectMode,
  selectViewData,
  setRepositoryData,
  startEditingField,
  updateEditFieldConfig,
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
  it("leaves the input layout unselected for a new input action", () => {
    const state = createInitialState();

    hydrateForm(
      { state },
      {
        layouts,
        layoutsData,
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        layouts,
      },
    });

    expect(viewData.selectedResourceId).toBe("");
    expect(viewData.defaultValues.resourceId).toBe("");
    expect(viewData.fieldRows).toEqual([]);
    expect(viewData.hasFields).toBe(false);
    expect(viewData.submitDisabled).toBe(true);
    expect(selectFormData({ state })).toBeUndefined();
  });

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
    expect(viewData.fieldRows.map((field) => field.summary)).toEqual([
      "Player Name - Required - Trim - Single line - Placeholder: Full name - Max: 32",
      "Player Code - Optional - Keep whitespace - Single line - Placeholder: Code - Max: 8",
    ]);
    expect(viewData.fieldRows[0]).toMatchObject({
      label: "Name",
      variableId: "playerName",
      required: true,
      trim: true,
      placeholder: "Full name",
      maxLength: 32,
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
        label: "Player Name",
        value: "playerName",
        suffixText: "string",
      },
      {
        label: "Player Code",
        value: "playerCode",
        suffixText: "string",
      },
    ]);
    expect(
      viewData.fieldVariableOptions.some((option) =>
        option.label.includes("("),
      ),
    ).toBe(false);
    expect(viewData.submitDisabled).toBe(false);
    expect(selectFormData({ state })).toEqual({
      id: expect.any(String),
      resourceId: inputLayout.id,
      fields: {
        name: {
          variableId: "playerName",
          required: true,
          trim: true,
          placeholder: "Full name",
          maxLength: 32,
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

  it("normalizes existing section transition submit actions to next line", () => {
    const state = createInitialState();

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
      resourceId: inputLayout.id,
    });
    expect(selectFormData({ state }).submitActions).toEqual({
      nextLine: {},
    });
  });

  it("edits field configuration as a draft before saving", () => {
    const state = createInitialState();

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
            nextLine: {},
          },
        },
      },
    );

    startEditingField({ state }, { field: "name" });
    updateEditFieldConfig(
      { state },
      { name: "placeholder", value: "Full name" },
    );

    expect(selectMode({ state })).toBe("editField");
    expect(selectFormData({ state }).fields.name.placeholder).toBe("Name");
    expect(
      selectFormDataWithEditingDraft({ state }).fields.name.placeholder,
    ).toBe("Full name");
    expect(selectCanSaveEditField({ state })).toBe(true);

    saveEditingField({ state });

    expect(selectMode({ state })).toBe("list");
    expect(selectFormData({ state }).fields.name.placeholder).toBe("Full name");
  });

  it("requires a variable before saving a field edit", () => {
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
          fields: {},
          submitActions: {
            nextLine: {},
          },
        },
      },
    );

    startEditingField({ state }, { field: "name" });

    let viewData = selectViewData({
      state,
      props: {
        layouts,
      },
    });

    expect(selectCanSaveEditField({ state })).toBe(false);
    expect(viewData.canSaveEditField).toBe(false);

    updateEditFieldConfig(
      { state },
      { name: "variableId", value: "playerName" },
    );

    viewData = selectViewData({
      state,
      props: {
        layouts,
      },
    });

    expect(selectCanSaveEditField({ state })).toBe(true);
    expect(viewData.canSaveEditField).toBe(true);
  });

  it("starts editing from a proxied field config", () => {
    const state = createInitialState();

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
              trim: false,
              placeholder: "Full name",
            },
          },
          submitActions: {
            nextLine: {},
          },
        },
      },
    );

    state.fields.name = new Proxy(state.fields.name, {});

    expect(() => {
      startEditingField({ state }, { field: "name" });
    }).not.toThrow();
    expect(selectMode({ state })).toBe("editField");
    expect(state.editFieldForm).toMatchObject({
      field: "name",
      label: "Name",
      variableId: "playerName",
      required: true,
      trim: false,
      placeholder: "Full name",
    });
  });
});
