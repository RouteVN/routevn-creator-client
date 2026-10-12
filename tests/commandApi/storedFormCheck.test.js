import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const layoutId = "layout-1";
const elementId = "text-1";

const setup = async ({ reportError = vi.fn() } = {}) => {
  const repository = await createProjectRepository({
    projectId: "project-1",
    store: {
      appendEvents: vi.fn(async () => {}),
      loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
    },
    events: [],
    historyLoaded: true,
  });
  const session = {
    getActor: vi.fn(() => ({ userId: "user-1", clientId: "client-1" })),
    submitCommand: vi.fn(async (command) => command.id),
    submitCommands: vi.fn(async (commands) =>
      commands.map((command) => command.id),
    ),
  };
  const shared = createCommandApiShared({
    idGenerator: (() => {
      let index = 0;
      return () => `cmd-${++index}`;
    })(),
    now: () => 1,
    reportError,
    getCurrentProjectId: () => "project-1",
    getCurrentRepository: async () => repository,
    getCachedRepository: () => repository,
    ensureCommandSessionForProject: async () => session,
    getOrCreateLocalActor: () => ({ userId: "user-1", clientId: "client-1" }),
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
  });
  const api = createLayoutCommandApi(shared);

  await api.createLayoutItem({
    layoutId,
    name: "Layout One",
    layoutType: "general",
  });
  await api.createLayoutElement({
    layoutId,
    elementId,
    data: {
      type: "text",
      name: "Title",
      x: 0,
      y: 0,
      width: 120,
      height: 24,
      anchorX: 0,
      anchorY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      hidden: true,
    },
  });
  session.submitCommand.mockClear();

  return { api, repository, reportError, session, shared };
};

const getElement = (repository) =>
  repository.getState().layouts.items[layoutId].elements.items[elementId];

describe("commandApi stored form check", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a change whose stored form would not load, and still saves it", async () => {
    const { api, repository, reportError, session } = await setup();

    const result = await api.updateLayoutElement({
      layoutId,
      elementId,
      data: { hidden: undefined },
      replace: false,
    });

    expect(result).toMatchObject({ valid: true });
    expect(session.submitCommand).toHaveBeenCalledOnce();
    expect(getElement(repository).hidden).toBeUndefined();
    expect(reportError).toHaveBeenCalledOnce();
    const [error, context] = reportError.mock.calls[0];
    expect(error.name).toBe("CommandInvalidOnceStoredError");
    expect(error.message).toBe(
      "layout.element.update: payload.data must include at least one updatable field",
    );
    expect(context).toEqual({
      operation: "projectCommand.validateStoredForm",
      code: error.code,
    });
  });

  it("does not report a change whose stored form still loads", async () => {
    const { api, reportError } = await setup();

    await api.updateLayoutElement({
      layoutId,
      elementId,
      data: { name: "Heading", hidden: undefined },
      replace: false,
    });
    await api.updateLayoutElement({
      layoutId,
      elementId,
      data: { name: "Subtitle" },
      replace: false,
    });

    expect(reportError).not.toHaveBeenCalled();
  });

  it("checks commands saved together", async () => {
    const { reportError, session, shared } = await setup();
    const context = await shared.ensureCommandContext();

    const result = await shared.submitCommandsWithContext({
      context,
      commands: [
        {
          scope: "layouts",
          type: COMMAND_TYPES.LAYOUT_ELEMENT_UPDATE,
          payload: {
            layoutId,
            elementId,
            data: { hidden: undefined },
            replace: false,
          },
        },
      ],
    });

    expect(result).toMatchObject({ valid: true });
    expect(session.submitCommands).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0][0].name).toBe(
      "CommandInvalidOnceStoredError",
    );
  });

  it("saves the change when the check itself fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const reportError = vi.fn(() => {
      throw new Error("reporter unavailable");
    });
    const { api, session } = await setup({ reportError });

    const result = await api.updateLayoutElement({
      layoutId,
      elementId,
      data: { hidden: undefined },
      replace: false,
    });

    expect(result).toMatchObject({ valid: true });
    expect(session.submitCommand).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(
      "Failed to check the stored form of a command",
      expect.objectContaining({ message: "reporter unavailable" }),
    );
  });
});
