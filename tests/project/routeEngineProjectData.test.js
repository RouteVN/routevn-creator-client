import { describe, expect, it } from "vitest";
import { sanitizeProjectDataForRouteEngine } from "../../src/internal/project/routeEngineProjectData.js";
import {
  normalizeUpdateVariableId,
  normalizeRouteEngineActions,
} from "../../src/internal/routeEngineActions.js";

describe("Route Engine action IDs", () => {
  it.each([
    ["a-b", "uv0061002d0062"],
    ["a_b", "uv0061005f0062"],
    ["a b", "uv006100200062"],
    ["", "uv"],
    [123, "uv003100320033"],
    ["Ab123", "Ab123"],
  ])("maps %s to %s", (id, expected) => {
    expect(normalizeUpdateVariableId(id)).toBe(expected);
  });

  it("maps nested actions without changing the input or remapping output", () => {
    const action = (id) => ({ updateVariable: { id } });
    const input = {
      conditional: { branches: [{ actions: action("a-b") }] },
      choice: { items: [{ events: { click: { actions: action("a_b") } } }] },
      random: { outcomes: [{ actions: action("a b") }] },
      updateVariable: { id: "Valid123" },
    };
    const original = structuredClone(input);
    const result = normalizeRouteEngineActions(input);
    expect(result.conditional.branches[0].actions.updateVariable.id).toBe(
      "uv0061002d0062",
    );
    expect(result.choice.items[0].events.click.actions.updateVariable.id).toBe(
      "uv0061005f0062",
    );
    expect(result.random.outcomes[0].actions.updateVariable.id).toBe(
      "uv006100200062",
    );
    expect(result.updateVariable.id).toBe("Valid123");
    expect(normalizeRouteEngineActions(result)).toBe(result);
    expect(input).toEqual(original);
  });
});

describe("Route Engine Next Line Config delays", () => {
  const config = (delay) => ({
    setNextLineConfig: {
      applyMode: "persistent",
      manual: { enabled: true },
      auto: { enabled: true, trigger: "fromComplete", delay },
    },
  });

  it("maps negative delays to 0, also in nested actions, without changing the input", () => {
    const input = {
      ...config(-500),
      conditional: { branches: [{ actions: config(-1) }] },
      choice: {
        items: [{ events: { click: { actions: config(-0.5) } } }],
      },
    };
    const original = structuredClone(input);

    const result = normalizeRouteEngineActions(input);

    expect(result.setNextLineConfig).toEqual(config(0).setNextLineConfig);
    expect(
      result.conditional.branches[0].actions.setNextLineConfig.auto.delay,
    ).toBe(0);
    expect(
      result.choice.items[0].events.click.actions.setNextLineConfig.auto.delay,
    ).toBe(0);
    expect(normalizeRouteEngineActions(result)).toBe(result);
    expect(input).toEqual(original);
  });

  it.each([
    ["0", 0],
    ["a positive delay", 1000],
    ["a settings binding", { $settings: "autoDelay" }],
    ["a template", "${variables.delay}"],
    ["no delay", undefined],
  ])("keeps %s", (_label, delay) => {
    const input = config(delay);
    expect(normalizeRouteEngineActions(input)).toBe(input);
  });

  it("keeps a config without auto settings", () => {
    const input = { setNextLineConfig: { manual: { enabled: false } } };
    expect(normalizeRouteEngineActions(input)).toBe(input);
  });
});

describe("sanitizeProjectDataForRouteEngine", () => {
  it("fixes the caller's copy in place instead of copying the story again", () => {
    const projectData = {
      story: {
        initialSceneId: "missing-scene",
        scenes: {
          "scene-1": {
            initialSectionId: "missing-section",
            sections: {
              "section-1": {
                initialLineId: "missing-line",
                lines: [{ id: "line-1" }, null],
              },
            },
          },
        },
      },
    };

    const result = sanitizeProjectDataForRouteEngine(projectData);

    expect(result.projectData).toBe(projectData);
    expect(result.didSanitize).toBe(true);
    expect(projectData.story.initialSceneId).toBe("scene-1");
    const scene = projectData.story.scenes["scene-1"];
    expect(scene.initialSectionId).toBe("section-1");
    expect(scene.sections["section-1"]).toEqual({
      initialLineId: "line-1",
      lines: [{ id: "line-1" }],
    });
  });
});
