import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import { createCommandApiShared } from "../../src/deps/services/shared/commandApi/shared.js";
import { createProjectRepository } from "../../src/deps/services/shared/projectRepository.js";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";

const layoutId = "layout-1";
const elementId = "text-1";

const setup = async ({ errorTracker = { capture: vi.fn() } } = {}) => {
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
    errorTracker,
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
  errorTracker.capture.mockClear();

  const updateElement = (data) =>
    api.updateLayoutElement({ layoutId, elementId, data, replace: false });

  return { reportError: errorTracker.capture, session, shared, updateElement };
};

describe("commandApi non-JSON payload report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a field that JSON would drop, after the change is saved", async () => {
    const { reportError, session, updateElement } = await setup();

    // Stored as JSON, this is `{ name: "Heading" }`, so `hidden` comes back
    // when the project loads again.
    const result = await updateElement({ name: "Heading", hidden: undefined });

    expect(result).toMatchObject({ valid: true });
    expect(session.submitCommand).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledOnce();
    const [error, context] = reportError.mock.calls[0];
    expect(error.name).toBe("NonJsonCommandPayloadError");
    expect(error.message).toBe(
      "layout.element.update: non-JSON value in hidden",
    );
    expect(context).toEqual({ operation: "projectCommand.nonJsonPayload" });
  });

  it("does not report a payload that JSON keeps as it is", async () => {
    const { reportError, updateElement } = await setup();

    await updateElement({ name: "Heading" });

    expect(reportError).not.toHaveBeenCalled();
  });

  it("lists every non-JSON field of a payload", async () => {
    const { reportError, updateElement } = await setup();

    await updateElement({ name: "Heading", hidden: undefined, x: undefined });

    expect(reportError.mock.calls[0][0].message).toBe(
      "layout.element.update: non-JSON value in hidden, x",
    );
  });

  it("reports each command type and set of fields once, and at most two per session", async () => {
    const { reportError, updateElement } = await setup();

    await updateElement({ name: "Heading", hidden: undefined });
    await updateElement({ name: "Subtitle", hidden: undefined });
    await updateElement({ name: "Caption", x: undefined });
    await updateElement({ name: "Label", y: undefined });

    expect(reportError.mock.calls.map(([error]) => error.message)).toEqual([
      "layout.element.update: non-JSON value in hidden",
      "layout.element.update: non-JSON value in x",
    ]);
  });

  it("does not report a change that was not saved", async () => {
    const { reportError, session, updateElement } = await setup();
    session.submitCommand.mockResolvedValueOnce({
      valid: false,
      error: { code: "rejected", message: "Rejected" },
    });

    await updateElement({ name: "Heading", hidden: undefined });

    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports commands saved together", async () => {
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
            data: { name: "Heading", hidden: undefined },
            replace: false,
          },
        },
      ],
    });

    expect(result).toMatchObject({ valid: true });
    expect(session.submitCommands).toHaveBeenCalledOnce();
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("saves the change when reporting fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { updateElement } = await setup({
      errorTracker: {
        capture: vi.fn(() => {
          throw new Error("reporter unavailable");
        }),
      },
    });

    const result = await updateElement({ name: "Heading", hidden: undefined });

    expect(result).toMatchObject({ valid: true });
    expect(console.warn).toHaveBeenCalledWith(
      "Failed to report a non-JSON command payload",
      expect.objectContaining({ message: "reporter unavailable" }),
    );
  });
});
