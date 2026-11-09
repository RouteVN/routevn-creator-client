import { describe, expect, it } from "vitest";
import {
  prepareRenderStateKeyboardForGraphics,
  toRouteGraphicsKeyboardResource,
  toRouteEngineKeyboardResource,
} from "../../src/internal/project/layout.js";
import { constructProjectData } from "../../src/internal/project/projection.js";

describe("keyboard projection", () => {
  it("projects interaction payloads to route-engine action maps", () => {
    expect(
      toRouteEngineKeyboardResource({
        enter: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        ctrl: {
          payload: {
            actions: {
              toggleSkipMode: {},
            },
          },
        },
      }),
    ).toEqual({
      enter: {
        actions: {
          nextLine: {},
        },
      },
      ctrl: {
        actions: {
          toggleSkipMode: {},
        },
      },
    });
  });

  it("combines keydown and keyup resources for route-graphics phases", () => {
    expect(
      toRouteGraphicsKeyboardResource(
        {
          enter: {
            actions: {
              nextLine: {},
            },
          },
        },
        {
          enter: {
            actions: {
              toggleAutoMode: {},
            },
          },
        },
      ),
    ).toEqual({
      enter: {
        actions: {
          nextLine: {},
        },
        keydown: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        keyup: {
          payload: {
            actions: {
              toggleAutoMode: {},
            },
          },
        },
      },
    });
  });

  it("maps keyboard render state to route-graphics keydown and keyup phases", () => {
    const renderState = prepareRenderStateKeyboardForGraphics({
      renderState: {
        global: {
          keyboard: {
            esc: {
              payload: {
                actions: {
                  nextLine: {},
                },
              },
            },
            enter: {
              keydown: {
                payload: {
                  actions: {
                    toggleSkipMode: {},
                  },
                },
              },
              keyup: {
                payload: {
                  actions: {
                    toggleAutoMode: {},
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(renderState.global.keyboard).toEqual({
      escape: {
        keydown: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
      },
      enter: {
        keydown: {
          payload: {
            actions: {
              toggleSkipMode: {},
            },
          },
        },
        keyup: {
          payload: {
            actions: {
              toggleAutoMode: {},
            },
          },
        },
      },
    });
  });

  it("projects controls with separate keyboard and keyup resources", () => {
    const projectData = constructProjectData({
      project: {
        resolution: {
          width: 1920,
          height: 1080,
        },
      },
      story: {},
      controls: {
        items: {
          "control-default": {
            id: "control-default",
            type: "control",
            name: "Default Control",
            keyboard: {
              enter: {
                payload: {
                  actions: {
                    nextLine: {},
                  },
                },
              },
            },
            keyup: {
              enter: {
                payload: {
                  actions: {
                    toggleAutoMode: {},
                  },
                },
              },
            },
            elements: {
              items: {},
              tree: [],
            },
          },
        },
        tree: [{ id: "control-default" }],
      },
    });

    expect(projectData.resources.controls["control-default"]).toMatchObject({
      keyboard: {
        enter: {
          actions: {
            nextLine: {},
          },
        },
      },
      keyup: {
        enter: {
          actions: {
            toggleAutoMode: {},
          },
        },
      },
    });
  });
  it("normalizes projected keyboard and nested element actions once", () => {
    const action = { updateVariable: { id: "a-b", operations: [] } };
    const interaction = { payload: { actions: action } };
    const projectData = constructProjectData({
      project: { resolution: { width: 1920, height: 1080 } },
      story: {},
      controls: {
        items: {
          control: {
            id: "control",
            type: "control",
            keyboard: { enter: interaction },
            elements: {
              items: {
                parent: { id: "parent", type: "container" },
                child: { id: "child", type: "container", click: interaction },
              },
              tree: [{ id: "parent", children: [{ id: "child" }] }],
            },
          },
        },
        tree: [{ id: "control" }],
      },
    });
    const control = projectData.resources.controls.control;
    expect(control.keyboard.enter.actions.updateVariable.id).toBe(
      "uv0061002d0062",
    );
    expect(
      control.elements[0].children[0].click.payload.actions.updateVariable.id,
    ).toBe("uv0061002d0062");
    expect(action.updateVariable.id).toBe("a-b");
  });
});
