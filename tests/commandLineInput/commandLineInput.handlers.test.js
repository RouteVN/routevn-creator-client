import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleFieldEditChange,
  handleFieldRowClick,
  handleSaveFieldEditClick,
  handleSubmitClick,
} from "../../src/components/commandLineInput/commandLineInput.handlers.js";
import {
  createInitialState,
  hydrateForm,
  saveEditingField,
  selectCanSaveEditField,
  selectFieldRows,
  selectFormData,
  selectFormDataWithEditingDraft,
  selectSelectedResourceId,
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
      },
      codeInput: {
        id: "codeInput",
        type: "input",
        name: "Code",
        field: "code",
      },
    },
    tree: [{ id: "nameInput" }, { id: "codeInput" }],
  },
};

const props = {
  layouts: [inputLayout],
  layoutsData: {
    items: {
      [inputLayout.id]: inputLayout,
    },
    tree: [{ id: inputLayout.id }],
  },
  form: {
    id: "profile-contact-form",
    resourceId: inputLayout.id,
    fields: {
      name: {
        variableId: "playerName",
        required: true,
        trim: true,
      },
      code: {
        variableId: "playerCode",
        required: true,
        trim: true,
      },
    },
    submitActions: {
      nextLine: {},
    },
  },
};

const createStoreApi = (state) => ({
  hydrateForm: (payload) => hydrateForm({ state }, payload),
  saveEditingField: (payload) => saveEditingField({ state }, payload),
  selectCanSaveEditField: () => selectCanSaveEditField({ state }),
  selectFieldRows: () => selectFieldRows({ state }),
  selectFormData: () => selectFormData({ state }),
  selectFormDataWithEditingDraft: () =>
    selectFormDataWithEditingDraft({ state }),
  selectSelectedResourceId: () => selectSelectedResourceId({ state }),
  startEditingField: (payload) => startEditingField({ state }, payload),
  updateEditFieldConfig: (payload) => updateEditFieldConfig({ state }, payload),
});

describe("commandLineInput.handlers", () => {
  it("emits temporary form presentation state while editing a field mapping", () => {
    const state = createInitialState();
    const store = createStoreApi(state);
    const render = vi.fn();
    const dispatchEvent = vi.fn();

    handleBeforeMount({
      props,
      store,
    });

    handleFieldRowClick(
      {
        render,
        store,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              field: "name",
            },
          },
        },
      },
    );

    handleFieldEditChange(
      {
        dispatchEvent,
        render,
        store,
      },
      {
        _event: {
          detail: {
            value: "Full name",
          },
          currentTarget: {
            dataset: {
              name: "placeholder",
            },
          },
        },
      },
    );

    expect(render).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].type).toBe(
      "temporary-presentation-state-change",
    );
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      presentationState: {
        form: {
          id: "profile-contact-form",
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
              required: true,
              trim: true,
              placeholder: "",
              maxLength: 32,
            },
          },
          submitActions: {
            nextLine: {},
          },
        },
      },
    });

    expect(selectFormData({ state }).fields.name.placeholder).toBe("");

    handleSaveFieldEditClick(
      {
        dispatchEvent,
        render,
        store,
      },
      {
        _event: {
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(selectFormData({ state }).fields.name.placeholder).toBe("Full name");
  });

  it("submits the authored form payload", () => {
    const state = createInitialState();
    const store = createStoreApi(state);
    const dispatchEvent = vi.fn();

    handleBeforeMount({
      props,
      store,
    });

    handleSubmitClick(
      {
        appService: {
          showAlert: vi.fn(),
        },
        dispatchEvent,
        store,
      },
      {
        _event: {
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      form: {
        id: "profile-contact-form",
        resourceId: inputLayout.id,
        fields: {
          name: {
            variableId: "playerName",
            required: true,
            trim: true,
            placeholder: "",
            maxLength: 32,
          },
          code: {
            variableId: "playerCode",
            required: true,
            trim: true,
            placeholder: "",
            maxLength: 32,
          },
        },
        submitActions: {
          nextLine: {},
        },
      },
    });
  });

  it("requires every input field to be mapped before submit", () => {
    const state = createInitialState();
    const store = createStoreApi(state);
    const showAlert = vi.fn();
    const dispatchEvent = vi.fn();

    handleBeforeMount({
      props: {
        ...props,
        form: {
          resourceId: inputLayout.id,
          fields: {},
        },
      },
      store,
    });

    handleSubmitClick(
      {
        appService: {
          showAlert,
        },
        dispatchEvent,
        store,
      },
      {
        _event: {
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(showAlert).toHaveBeenCalledWith({
      message: "Map every input field to a string variable.",
      title: "Warning",
    });
  });

  it("requires a variable before saving a field edit", () => {
    const state = createInitialState();
    const store = createStoreApi(state);
    const showAlert = vi.fn();
    const dispatchEvent = vi.fn();
    const render = vi.fn();

    handleBeforeMount({
      props: {
        ...props,
        form: {
          resourceId: inputLayout.id,
          fields: {},
        },
      },
      store,
    });

    handleFieldRowClick(
      {
        render,
        store,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              field: "name",
            },
          },
        },
      },
    );

    handleSaveFieldEditClick(
      {
        appService: {
          showAlert,
        },
        dispatchEvent,
        render,
        store,
      },
      {
        _event: {
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(showAlert).toHaveBeenCalledWith({
      message: "Choose a string variable for this input field.",
      title: "Warning",
    });
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(1);
  });
});
