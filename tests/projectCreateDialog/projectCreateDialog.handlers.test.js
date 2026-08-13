import { describe, expect, it, vi } from "vitest";
import {
  handleFormAction,
  handleProjectIconClick,
} from "../../src/components/projectCreateDialog/projectCreateDialog.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("projectCreateDialog handlers", () => {
  it("requires project icon sources to be at least 512px", async () => {
    const deps = {
      appService: {
        pickFiles: vi.fn(async () => undefined),
      },
      store: {},
      render: vi.fn(),
      i18n: EN_I18N,
    };

    await handleProjectIconClick(deps);

    expect(deps.appService.pickFiles).toHaveBeenCalledWith({
      accept: "image/*",
      multiple: false,
      validations: [
        {
          type: "image-min-size",
          minWidth: 512,
          minHeight: 512,
        },
      ],
    });
  });

  it("emits validated values from the sticky form action", () => {
    const dispatchEvent = vi.fn();
    const deps = {
      dispatchEvent,
      i18n: EN_I18N,
      refs: {
        createProjectForm: {
          getValues: vi.fn(() => ({ name: "Project One" })),
          validate: vi.fn(() => ({ valid: true, errors: {} })),
        },
      },
      render: vi.fn(),
      store: {
        selectDefaultValues: vi.fn(() => ({ language: "en" })),
        selectIconFile: vi.fn(() => undefined),
        selectPlatform: vi.fn(() => "android"),
        selectProjectPath: vi.fn(() => ""),
        setValidationErrors: vi.fn(),
      },
    };

    handleFormAction(deps, {
      _event: { detail: { actionId: "submit", valid: true } },
    });

    const event = dispatchEvent.mock.calls[0][0];
    expect(event.type).toBe("submit");
    expect(event.detail).toEqual({
      values: {
        language: "en",
        name: "Project One",
        projectPath: "",
        iconFile: undefined,
      },
    });
  });
});
