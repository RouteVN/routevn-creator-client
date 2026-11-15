import { readFileSync } from "node:fs";
import { normalizeState, processCommand } from "@routevn/creator-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  repositoryService: {
    ensureRepository: vi.fn(),
    getCachedStore: vi.fn(),
    getEnsuredProjectId: vi.fn(() => "project-1"),
  },
  store: { app: { get: vi.fn(), set: vi.fn() } },
  commandApi: {
    updateLineActions: vi.fn(),
    updateLayoutElement: vi.fn(),
    updateControlItem: vi.fn(),
    updateControlElement: vi.fn(),
    upgradeLayoutSchemaVersion: vi.fn(),
  },
}));

vi.mock("../../src/deps/services/shared/projectRepositoryService.js", () => ({
  createProjectRepositoryService: () => mocked.repositoryService,
}));
vi.mock("../../src/deps/services/shared/projectCollabCore.js", () => ({
  createProjectCollabCore: () => ({ commandApi: mocked.commandApi }),
}));
vi.mock("../../src/deps/services/shared/projectAssetService.js", () => ({
  createProjectAssetService: () => ({}),
}));
vi.mock("../../src/deps/services/shared/projectExportService.js", () => ({
  createProjectExportService: () => ({}),
}));

import { createProjectServiceCore } from "../../src/deps/services/shared/projectServiceCore.js";

const PATCH_KEY = "contentPatch.sectionTransitionResetStory-1-22-0";
const COMMAND_TYPES = {
  updateLineActions: "line.update_actions",
  updateLayoutElement: "layout.element.update",
  updateControlItem: "control.update",
  updateControlElement: "control.element.update",
};

const readTemplateState = () =>
  normalizeState({
    state: JSON.parse(
      readFileSync(
        new URL(
          "../../static/templates/default/repository.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  });

// Walk every key, independently of the patch's target selection and traversal.
const findKeys = (value, key, path = []) => {
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([entryKey, entry]) => {
    const entryPath = [...path, entryKey];
    const matches = entryKey === key ? [{ path: entryPath, value: entry }] : [];
    return matches.concat(findKeys(entry, key, entryPath));
  });
};

const stripNavigationKeys = (value) => {
  if (Array.isArray(value)) {
    return value.map(stripNavigationKeys);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) => key !== "sectionTransition" && key !== "resetStoryAtSection",
      )
      .map(([key, entry]) => [key, stripNavigationKeys(entry)]),
  );
};

const createLegacyFixture = () => {
  let state = readTemplateState();
  const scenes = Object.values(state.scenes.items).filter(
    (item) => item.type === "scene",
  );
  const [firstScene, secondScene] = scenes;
  const firstSection = Object.values(firstScene.sections.items)[0];
  const secondSection = Object.values(secondScene.sections.items)[0];
  const firstLine = Object.values(firstSection.lines.items)[0];
  const secondLines = Object.values(secondSection.lines.items);
  const layout = Object.values(state.layouts.items).find(
    (item) => item.type === "layout",
  );
  const layoutElement = Object.values(layout.elements.items)[0];
  const control = Object.values(state.controls.items).find(
    (item) => item.type === "control",
  );
  const controlElement = Object.values(control.elements.items)[0];
  const confirmLayout = Object.values(state.layouts.items).find(
    (item) => item.layoutType === "confirmDialog",
  );
  const choiceLayout = Object.values(state.layouts.items).find(
    (item) => item.layoutType === "choice",
  );
  const animation = Object.values(state.animations.items).find(
    (item) => item.type === "animation",
  );
  const reset = (sectionId) => ({
    resetStoryAtSection: {
      sectionId,
      screen: { animations: { resourceId: animation.id } },
    },
  });
  const interaction = (actions) => ({ payload: { actions } });
  const inject = (type, payload) => {
    const result = processCommand({ state, command: { type, payload } });
    expect(
      result,
      `fixture command ${type}: ${JSON.stringify(result.error)}`,
    ).toMatchObject({ valid: true });
    state = result.state;
  };

  inject("line.update_actions", {
    lineId: firstLine.id,
    data: { ...firstLine.actions, ...reset(secondSection.id) },
    replace: true,
  });
  inject("line.update_actions", {
    lineId: secondLines[0].id,
    data: {
      ...secondLines[0].actions,
      conditional: {
        branches: [
          { when: { eq: [1, 1] }, actions: reset(firstSection.id) },
          {
            actions: {
              conditional: {
                branches: [
                  { actions: { ...reset(secondSection.id), stopSkipMode: {} } },
                ],
              },
            },
          },
        ],
      },
    },
    replace: true,
  });
  inject("line.update_actions", {
    lineId: secondLines[1].id,
    data: {
      ...secondLines[1].actions,
      choice: {
        gui: { resourceId: choiceLayout.id },
        items: [
          {
            id: "choice-1",
            content: [{ text: "Option One" }],
            events: { click: { actions: reset(firstSection.id) } },
          },
        ],
      },
    },
    replace: true,
  });
  inject("line.update_actions", {
    lineId: secondLines[2].id,
    data: {
      ...secondLines[2].actions,
      dialogue: {
        items: [
          {
            id: "dialogue-1",
            content: [{ text: "Line One" }],
            actions: reset(secondSection.id),
          },
        ],
      },
    },
    replace: true,
  });
  inject("layout.element.update", {
    layoutId: layout.id,
    elementId: layoutElement.id,
    data: {
      click: interaction({
        ...reset(firstSection.id),
        showConfirmDialog: {
          resourceId: confirmLayout.id,
          confirmActions: { popOverlay: {}, ...reset(secondSection.id) },
        },
      }),
      rightClick: interaction(reset(secondSection.id)),
    },
    replace: false,
  });
  inject("control.element.update", {
    controlId: control.id,
    elementId: controlElement.id,
    data: {
      click: interaction(reset(firstSection.id)),
      rightClick: interaction(reset(secondSection.id)),
    },
    replace: false,
  });
  inject("control.update", {
    controlId: control.id,
    data: {
      keyboard: {
        ...control.keyboard,
        enter: interaction(reset(secondSection.id)),
        esc: interaction(reset(firstSection.id)),
      },
      keyup: {
        ...control.keyup,
        ctrl: interaction({
          stopSkipMode: {},
          ...reset(secondSection.id),
        }),
      },
    },
  });

  return { state, layoutId: layout.id, elementId: layoutElement.id };
};

const createTestProjectService = () =>
  createProjectServiceCore({
    router: { getPayload: () => ({ p: "project-1" }) },
    db: {},
    filePicker: {},
    idGenerator: () => "generated-id",
    now: () => 0,
    collabLog: () => {},
    creatorVersion: 1,
    storageAdapter: { initializeProject: vi.fn() },
    fileAdapter: {},
    collabAdapter: {},
  });

describe("section transition reset story patch with creator-model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocked.repositoryService.getCachedStore.mockReturnValue(mocked.store);
    mocked.store.app.get.mockImplementation(async (key) =>
      key === PATCH_KEY ? undefined : true,
    );
    mocked.store.app.set.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts every patch command, upgrades every legacy action, and preserves all other project data", async () => {
    const fixture = createLegacyFixture();
    let state = fixture.state;
    const initial = structuredClone(state);
    const legacyActions = findKeys(initial, "resetStoryAtSection");
    expect(legacyActions).toHaveLength(13);
    const sceneBySection = new Map();
    for (const scene of Object.values(initial.scenes.items)) {
      for (const sectionId of Object.keys(scene.sections?.items ?? {})) {
        sceneBySection.set(sectionId, scene.id);
      }
    }
    const commands = [];
    for (const [method, type] of Object.entries(COMMAND_TYPES)) {
      mocked.commandApi[method].mockImplementation(async (payload) => {
        const command = { type, payload };
        const result = processCommand({ state, command });
        commands.push({ command, result });
        if (result.valid) {
          state = result.state;
        }
        return result;
      });
    }
    const repository = { getState: vi.fn(() => state) };
    mocked.repositoryService.ensureRepository.mockResolvedValue(repository);
    const service = createTestProjectService();

    await expect(service.ensureRepository()).resolves.toBe(repository);

    expect(commands).toHaveLength(8);
    for (const { command, result } of commands) {
      expect(
        result,
        `${command.type}: ${JSON.stringify(result.error)}`,
      ).toMatchObject({ valid: true });
    }
    expect(commands.map(({ command }) => command.type)).toEqual([
      "line.update_actions",
      "line.update_actions",
      "line.update_actions",
      "line.update_actions",
      "layout.element.update",
      "control.update",
      "control.update",
      "control.element.update",
    ]);
    expect(
      mocked.commandApi.updateControlItem.mock.calls.map(([{ data }]) =>
        Object.keys(data),
      ),
    ).toEqual([["keyboard"], ["keyup"]]);
    expect(findKeys(state, "resetStoryAtSection")).toEqual([]);
    expect(findKeys(state, "sectionTransition")).toHaveLength(
      findKeys(initial, "sectionTransition").length + legacyActions.length,
    );
    for (const { path, value } of legacyActions) {
      const parent = path.slice(0, -1).reduce((item, key) => item[key], state);
      expect(parent.sectionTransition, path.join(".")).toEqual({
        ...value,
        sceneId: sceneBySection.get(value.sectionId),
        resetStory: true,
      });
      expect(parent).not.toHaveProperty("resetStoryAtSection");
    }
    expect(stripNavigationKeys(state)).toEqual(stripNavigationKeys(initial));
    expect(fixture.state).toEqual(initial);
    expect(mocked.store.app.set).toHaveBeenCalledExactlyOnceWith(
      PATCH_KEY,
      true,
    );
    for (const method of Object.keys(COMMAND_TYPES)) {
      expect(
        mocked.commandApi[method].mock.invocationCallOrder.at(-1),
      ).toBeLessThan(mocked.store.app.set.mock.invocationCallOrder[0]);
    }
    expect(mocked.commandApi.upgradeLayoutSchemaVersion).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("documents that the model rejects interaction actions in conditionalOverrides", () => {
    const { state, layoutId, elementId } = createLegacyFixture();
    // Do not inject this into the end-to-end fixture: set only supports visual fields.
    const result = processCommand({
      state,
      command: {
        type: "layout.element.update",
        payload: {
          layoutId,
          elementId,
          replace: false,
          data: {
            conditionalOverrides: [
              {
                when: {
                  target: "dialogue.characterId",
                  op: "eq",
                  value: "character-1",
                },
                set: {
                  click: {
                    payload: {
                      actions: {
                        resetStoryAtSection: {
                          sectionId: Object.values(state.scenes.items).find(
                            (item) => item.type === "scene",
                          ).sections.tree[0].id,
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    });

    expect(result).toMatchObject({ valid: false });
    expect(result.error.message).toContain("conditionalOverrides.0.set");
    expect(result.error.message).toContain("click");
  });
});
