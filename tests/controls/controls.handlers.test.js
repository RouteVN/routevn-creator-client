import { describe, expect, it, vi } from "vitest";
import {
  createControlTemplate,
  handleKeyboardActionsChange,
  handleKeyboardItemRightClick,
} from "../../src/pages/controls/controls.handlers.js";
import { EN_I18N } from "../support/i18n.js";

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
      i18n: EN_I18N,
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
      i18n: EN_I18N,
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

describe("handleKeyboardItemRightClick", () => {
  it("sends an empty keyboard map when the last keydown binding is deleted", async () => {
    const updateControlItem = vi.fn(async () => ({}));
    const deps = {
      appService: {
        showAlert: vi.fn(),
        showDropdownMenu: vi.fn(async () => ({
          item: {
            key: "remove",
          },
        })),
      },
      i18n: EN_I18N,
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
        setItems: vi.fn(),
        setTagsData: vi.fn(),
      },
      render: vi.fn(),
      refs: {},
    };

    await handleKeyboardItemRightClick(deps, {
      _event: {
        preventDefault: vi.fn(),
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            key: "enter",
            phase: "keydown",
          },
        },
      },
    });

    expect(updateControlItem).toHaveBeenCalledTimes(1);
    expect(updateControlItem.mock.calls[0][0]).toStrictEqual({
      controlId: "control-1",
      data: {
        keyboard: {},
      },
    });
  });
});
