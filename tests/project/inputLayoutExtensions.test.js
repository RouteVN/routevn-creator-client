import { describe, expect, it } from "vitest";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";
import {
  applyCommandsToRepositoryState,
  assertSupportedProjectState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";

const actor = {
  userId: "user-1",
  clientId: "client-1",
};

const createCommand = (overrides = {}) => ({
  id: "command-1",
  projectId: "project-1",
  partition: "project-1:resources:layouts",
  type: COMMAND_TYPES.LAYOUT_CREATE,
  payload: {
    layoutId: "profile-form",
    data: {
      type: "layout",
      name: "Profile Form",
      layoutType: "input",
      layoutSchemaVersion: 2,
      elements: {
        items: {},
        tree: [],
      },
    },
  },
  actor,
  clientTs: 1,
  schemaVersion: 1,
  ...overrides,
});

describe("input layout creator-model support", () => {
  it("keeps input layout type and input element fields in repository state", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        createCommand(),
        createCommand({
          id: "command-2",
          partition: "project-1:layouts",
          type: COMMAND_TYPES.LAYOUT_ELEMENT_CREATE,
          payload: {
            layoutId: "profile-form",
            elementId: "name-input",
            data: {
              type: "input",
              name: "Name Input",
              field: "name",
              x: 510,
              y: 230,
              width: 330,
              height: 52,
            },
          },
          clientTs: 2,
        }),
        createCommand({
          id: "command-3",
          partition: "project-1:layouts",
          type: COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE,
          payload: {
            layoutId: "profile-form",
            elementId: "name-input",
            data: {
              field: "code",
            },
            replace: false,
          },
          clientTs: 3,
        }),
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.repositoryState.layouts.items["profile-form"]).toMatchObject({
      layoutType: "input",
      elements: {
        items: {
          "name-input": {
            type: "input",
            name: "Name Input",
            field: "code",
            x: 510,
            y: 230,
            width: 330,
            height: 52,
          },
        },
      },
    });
    expect(() =>
      assertSupportedProjectState(result.repositoryState),
    ).not.toThrow();
  });
});
