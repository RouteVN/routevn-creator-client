import { describe, expect, it, vi } from "vitest";
import {
  createLayoutEditorElementPersistPayload,
  persistLayoutEditorElementUpdate,
  shouldPersistLayoutEditorFieldImmediately,
} from "../../src/pages/layoutEditor/support/layoutEditorPersistence.js";

describe("layoutEditorPersistence", () => {
  it("marks interaction fields as immediate-save changes", () => {
    expect(
      shouldPersistLayoutEditorFieldImmediately({
        name: "click",
        itemType: "container",
      }),
    ).toBe(true);
    expect(
      shouldPersistLayoutEditorFieldImmediately({
        name: "rightClick.payload.actions",
        itemType: "container",
      }),
    ).toBe(true);
    expect(
      shouldPersistLayoutEditorFieldImmediately({
        name: "conditionalOverrides",
        itemType: "text",
      }),
    ).toBe(true);
    expect(
      shouldPersistLayoutEditorFieldImmediately({
        name: "conditionalOverrides",
        itemType: "sprite",
      }),
    ).toBe(true);
    expect(
      shouldPersistLayoutEditorFieldImmediately({
        name: "paginationMode",
        itemType: "container-ref-save-load-slot",
      }),
    ).toBe(true);
    expect(
      shouldPersistLayoutEditorFieldImmediately({
        name: "x",
        itemType: "container",
      }),
    ).toBe(false);
  });

  it("forces replace payloads for additive nested changes", () => {
    const result = createLayoutEditorElementPersistPayload({
      currentItem: {
        id: "text-1",
        type: "text",
        textStyle: {
          align: "left",
        },
      },
      updatedItem: {
        id: "text-1",
        type: "text",
        textStyle: {
          align: "center",
        },
      },
    });

    expect(result).toEqual({
      hasChanges: true,
      replace: true,
      data: {
        type: "text",
        textStyle: {
          align: "center",
        },
      },
    });
  });

  it("forces replace payloads when fields are removed", () => {
    const result = createLayoutEditorElementPersistPayload({
      currentItem: {
        id: "sprite-1",
        type: "sprite",
        imageId: "default",
        hoverImageId: "hover",
      },
      updatedItem: {
        id: "sprite-1",
        type: "sprite",
        imageId: "default",
      },
    });

    expect(result.hasChanges).toBe(true);
    expect(result.replace).toBe(true);
    expect(result.data).toEqual({
      type: "sprite",
      imageId: "default",
    });
  });

  it("persists through the correct repository method for control elements", async () => {
    const updateControlElement = vi.fn(async () => {});
    const projectService = {
      getRepositoryState: () => ({
        controls: {
          items: {
            "control-1": {
              elements: {
                items: {
                  "rect-1": {
                    type: "rect",
                    x: 0,
                    y: 0,
                  },
                },
              },
            },
          },
        },
        layouts: { items: {} },
      }),
      updateControlElement,
      updateLayoutElement: vi.fn(async () => {}),
    };

    const result = await persistLayoutEditorElementUpdate({
      projectService,
      layoutId: "control-1",
      resourceType: "controls",
      selectedItemId: "rect-1",
      updatedItem: {
        id: "rect-1",
        type: "rect",
        x: 20,
        y: 0,
      },
    });

    expect(result.didPersist).toBe(true);
    expect(updateControlElement).toHaveBeenCalledWith({
      controlId: "control-1",
      elementId: "rect-1",
      data: {
        x: 20,
      },
      replace: false,
    });
  });

  it("persists nested interaction action changes as a replace payload", async () => {
    const updateLayoutElement = vi.fn(async () => {});
    const projectService = {
      getRepositoryState: () => ({
        layouts: {
          items: {
            "layout-1": {
              elements: {
                items: {
                  "container-1": {
                    type: "container",
                    x: 0,
                    y: 0,
                    click: {
                      payload: {
                        actions: {
                          setMenuPage: {
                            value: "options",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        controls: { items: {} },
      }),
      updateLayoutElement,
      updateControlElement: vi.fn(async () => {}),
    };

    const result = await persistLayoutEditorElementUpdate({
      projectService,
      layoutId: "layout-1",
      resourceType: "layouts",
      selectedItemId: "container-1",
      updatedItem: {
        id: "container-1",
        type: "container",
        x: 0,
        y: 0,
        click: {
          payload: {
            actions: {
              setMenuPage: {
                value: "options",
              },
              pushLayeredView: {
                resourceId: "layout-settings",
              },
            },
          },
        },
      },
    });

    expect(result.didPersist).toBe(true);
    expect(updateLayoutElement).toHaveBeenCalledWith({
      layoutId: "layout-1",
      elementId: "container-1",
      data: {
        type: "container",
        x: 0,
        y: 0,
        click: {
          payload: {
            actions: {
              setMenuPage: {
                value: "options",
              },
              pushLayeredView: {
                resourceId: "layout-settings",
              },
            },
          },
        },
      },
      replace: true,
    });
  });
});
