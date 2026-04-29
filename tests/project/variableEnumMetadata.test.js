import { describe, expect, it } from "vitest";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";
import {
  applyCommandToRepositoryState,
  applyCommandsToRepositoryState,
  assertSupportedProjectState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";

const createCommand = (overrides = {}) => ({
  id: "command-1",
  projectId: "project-1",
  partition: "project-1:resources:variables",
  type: COMMAND_TYPES.VARIABLE_CREATE,
  payload: {
    variableId: "mood",
    data: {
      type: "string",
      name: "Mood",
      description: "",
      scope: "context",
      isEnum: true,
      enumValues: ["happy", "sad", "happy", ""],
      default: "happy",
      value: "happy",
    },
  },
  actor: {
    userId: "user-1",
    clientId: "client-1",
  },
  clientTs: 1,
  schemaVersion: 1,
  ...overrides,
});

describe("variable enum metadata", () => {
  it("keeps enum metadata in repository state while validating against creator model", () => {
    const createResult = applyCommandToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      command: createCommand(),
      projectId: "project-1",
    });

    expect(createResult.valid).toBe(true);
    expect(createResult.repositoryState.variables.items.mood).toMatchObject({
      type: "string",
      isEnum: true,
      enumValues: ["happy", "sad"],
      default: "happy",
      value: "happy",
    });

    expect(() =>
      assertSupportedProjectState(createResult.repositoryState),
    ).not.toThrow();
  });

  it("rejects invalid enum metadata through creator model validation", () => {
    const createResult = applyCommandToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      command: createCommand({
        payload: {
          variableId: "mood",
          data: {
            type: "string",
            name: "Mood",
            description: "",
            scope: "context",
            isEnum: true,
            enumValues: [42],
            default: "happy",
            value: "happy",
          },
        },
      }),
      projectId: "project-1",
    });

    expect(createResult.valid).toBe(false);
    expect(createResult.error?.message).toContain(
      "payload.data.enumValues[0] must be a string",
    );
  });

  it("clears enum metadata when a variable update turns enum off", () => {
    const commands = [
      createCommand(),
      createCommand({
        id: "command-2",
        type: COMMAND_TYPES.VARIABLE_UPDATE,
        payload: {
          variableId: "mood",
          data: {
            isEnum: false,
            enumValues: [],
            default: "",
            value: "",
          },
        },
      }),
    ];

    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      commands,
      projectId: "project-1",
    });

    expect(result.valid).toBe(true);
    expect(result.repositoryState.variables.items.mood.isEnum).toBeUndefined();
    expect(
      result.repositoryState.variables.items.mood.enumValues,
    ).toBeUndefined();
  });
});
