import { describe, expect, it, vi } from "vitest";
import {
  handleBeforeMount,
  handleFieldConfigChange,
  handleSubmitClick,
} from "../../src/components/commandLineInput/commandLineInput.handlers.js";
import {
  createInitialState,
  hydrateForm,
  selectFieldRows,
  selectFormData,
  selectSelectedResourceId,
  selectSettingsForm,
  setRepositoryData,
  setSelectedResourceId,
  updateFieldConfig,
  updateSettingsForm,
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
  selectFieldRows: () => selectFieldRows({ state }),
  selectFormData: () => selectFormData({ state }),
  selectSelectedResourceId: () => selectSelectedResourceId({ state }),
  selectSettingsForm: () => selectSettingsForm({ state }),
  setRepositoryData: (payload) => setRepositoryData({ state }, payload),
  setSelectedResourceId: (payload) => setSelectedResourceId({ state }, payload),
  updateFieldConfig: (payload) => updateFieldConfig({ state }, payload),
  updateSettingsForm: (payload) => updateSettingsForm({ state }, payload),
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

    handleFieldConfigChange(
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
              field: "name",
              name: "placeholder",
            },
          },
        },
      },
    );

    expect(render).toHaveBeenCalledTimes(1);
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
            },
            code: {
              variableId: "playerCode",
              required: true,
              trim: true,
              placeholder: "",
            },
          },
          submitActions: {
            nextLine: {},
          },
        },
      },
    });
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
          },
          code: {
            variableId: "playerCode",
            required: true,
            trim: true,
            placeholder: "",
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
});
