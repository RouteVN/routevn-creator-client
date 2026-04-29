import { describe, expect, it, vi } from "vitest";
import {
  createControlTemplate,
  handleKeyboardActionsChange,
} from "../../src/pages/controls/controls.handlers.js";

describe("createControlTemplate", () => {
  const projectResolution = {
    width: 1920,
    height: 1080,
  };

  it("creates control elements with required ids and names", () => {
    const template = createControlTemplate(projectResolution);
    const itemEntries = Object.entries(template.items);

    expect(Array.isArray(template.tree)).toBe(true);
    expect(itemEntries.length).toBeGreaterThan(0);

    itemEntries.forEach(([itemId, item]) => {
      expect(item.id).toBe(itemId);
      expect(item.name).toBeTruthy();
    });
  });
});

describe("handleKeyboardActionsChange", () => {
  it("merges the submitted action delta with existing keydown actions", async () => {
    const updateControlItem = vi.fn(async () => ({}));
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        updateControlItem,
        getRepositoryState: () => ({
          controls: {
            items: {},
            tree: [],
          },
        }),
      },
      store: {
        selectKeyboardEditorPhase: () => "keydown",
        selectKeyboardEditorKey: () => "enter",
        selectSelectedItem: () => ({
          id: "control-1",
          type: "control",
          keyboard: {
            enter: {
              payload: {
                actions: {
                  toggleAutoMode: {},
                },
              },
            },
          },
        }),
        closeKeyboardEditor: vi.fn(),
        setItems: vi.fn(),
        setTagsData: vi.fn(),
      },
      render: vi.fn(),
      refs: {},
    };

    await handleKeyboardActionsChange(deps, {
      _event: {
        detail: {
          toggleSkipMode: {},
        },
      },
    });

    expect(updateControlItem).toHaveBeenCalledWith({
      controlId: "control-1",
      data: {
        keyboard: {
          enter: {
            payload: {
              actions: {
                toggleAutoMode: {},
                toggleSkipMode: {},
              },
            },
          },
        },
      },
    });
  });

  it("writes submitted keyup actions to control.keyup", async () => {
    const updateControlItem = vi.fn(async () => ({}));
    const deps = {
      appService: {
        showAlert: vi.fn(),
      },
      projectService: {
        updateControlItem,
        getRepositoryState: () => ({
          controls: {
            items: {},
            tree: [],
          },
        }),
      },
      store: {
        selectKeyboardEditorPhase: () => "keyup",
        selectKeyboardEditorKey: () => "enter",
        selectSelectedItem: () => ({
          id: "control-1",
          type: "control",
          keyup: {
            enter: {
              payload: {
                actions: {
                  toggleAutoMode: {},
                },
              },
            },
          },
        }),
        closeKeyboardEditor: vi.fn(),
        setItems: vi.fn(),
        setTagsData: vi.fn(),
      },
      render: vi.fn(),
      refs: {},
    };

    await handleKeyboardActionsChange(deps, {
      _event: {
        detail: {
          toggleSkipMode: {},
        },
      },
    });

    expect(updateControlItem).toHaveBeenCalledWith({
      controlId: "control-1",
      data: {
        keyup: {
          enter: {
            payload: {
              actions: {
                toggleAutoMode: {},
                toggleSkipMode: {},
              },
            },
          },
        },
      },
    });
  });
});
