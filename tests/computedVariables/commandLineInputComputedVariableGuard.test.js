import { describe, expect, it, vi } from "vitest";
import { handleSubmitClick } from "../../src/components/commandLineInput/commandLineInput.handlers.js";
import {
  createInitialState,
  hydrateForm,
  selectCanSubmit,
  selectFieldRows,
  selectFormData,
  selectSelectedResourceId,
  setRepositoryData,
} from "../../src/components/commandLineInput/commandLineInput.store.js";
import { EN_I18N } from "../support/i18n.js";

const inputLayout = {
  id: "profile-layout",
  type: "layout",
  name: "Profile",
  layoutType: "input",
  elements: {
    items: {
      nameInput: {
        id: "nameInput",
        type: "input",
        field: "name",
      },
    },
    tree: [{ id: "nameInput" }],
  },
};

describe("commandLineInput computed-variable guard", () => {
  it("rejects a hydrated form mapping to a computed string variable", () => {
    const state = createInitialState();
    setRepositoryData(
      { state },
      {
        variables: {
          items: {
            displayName: {
              id: "displayName",
              type: "variable",
              name: "Display Name",
              variableType: "string",
              computed: { expr: "Player" },
            },
          },
          tree: [{ id: "displayName" }],
        },
      },
    );
    hydrateForm(
      { state },
      {
        layouts: [inputLayout],
        layoutsData: {
          items: {
            [inputLayout.id]: inputLayout,
          },
        },
        form: {
          resourceId: inputLayout.id,
          fields: {
            name: {
              variableId: "displayName",
            },
          },
        },
      },
    );

    const appService = {
      showAlert: vi.fn(),
    };
    const dispatchEvent = vi.fn();
    const store = {
      selectFieldRows: () => selectFieldRows({ state }),
      selectFormData: () => selectFormData({ state }),
      selectSelectedResourceId: () => selectSelectedResourceId({ state }),
    };

    expect(selectCanSubmit({ state })).toBe(false);

    handleSubmitClick(
      {
        appService,
        dispatchEvent,
        i18n: EN_I18N,
        store,
      },
      {
        _event: {
          stopPropagation: vi.fn(),
        },
      },
    );

    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Computed variables cannot be updated.",
      title: "Warning",
    });
  });
});
