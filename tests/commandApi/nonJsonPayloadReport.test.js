import { afterEach, describe, expect, it, vi } from "vitest";
import { createLayoutCommandApi } from "../../src/deps/services/shared/commandApi/layouts.js";
import {
  collectNonJsonFields,
  createCommandApiShared,
} from "../../src/deps/services/shared/commandApi/shared.js";
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
  errorTracker?.capture.mockClear();

  const updateElement = (data) =>
    api.updateLayoutElement({ layoutId, elementId, data, replace: false });

  return {
    reportError: errorTracker?.capture,
    repository,
    session,
    shared,
    updateElement,
  };
};

describe("commandApi non-JSON payload report", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a field that JSON would drop", async () => {
    const { reportError, session, updateElement } = await setup();

    // Its JSON form is `{ name: "Heading" }`, which leaves `hidden` as it was.
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

  it("reports the same fields once whatever their order", async () => {
    const { reportError, updateElement } = await setup();

    await updateElement({ name: "Heading", hidden: undefined, x: undefined });
    await updateElement({ x: undefined, name: "Subtitle", hidden: undefined });

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0][0].message).toBe(
      "layout.element.update: non-JSON value in hidden, x",
    );
  });

  it("does not report a create, which loads back the same", async () => {
    const { reportError, session, shared } = await setup();
    const api = createLayoutCommandApi(shared);

    await api.createLayoutItem({
      layoutId: "layout-2",
      name: "Layout Two",
      layoutType: "general",
      data: { description: undefined },
    });

    expect(session.submitCommand).toHaveBeenCalledOnce();
    expect(reportError).not.toHaveBeenCalled();
  });

  it("checks nothing without an error tracker", async () => {
    const { session, updateElement } = await setup({ errorTracker: null });

    const result = await updateElement({ name: "Heading", hidden: undefined });

    expect(result).toMatchObject({ valid: true });
    expect(session.submitCommand).toHaveBeenCalledOnce();
  });

  it("reports a change whose JSON form is rejected", async () => {
    const { reportError, session, updateElement } = await setup();

    // Its JSON form is `{}`, which updates nothing.
    const result = await updateElement({ hidden: undefined });

    expect(result).toMatchObject({ valid: false });
    expect(session.submitCommand).not.toHaveBeenCalled();
    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0][0].message).toBe(
      "layout.element.update: non-JSON value in hidden",
    );
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

describe("commandApi JSON form of payloads", () => {
  const getElement = (repository) =>
    repository.getState().layouts.items[layoutId].elements.items[elementId];

  it("saves and applies the payload's JSON form", async () => {
    const { repository, session, updateElement } = await setup();

    const result = await updateElement({ name: "Heading", hidden: undefined });

    expect(result).toMatchObject({ valid: true });
    const [command] = session.submitCommand.mock.calls[0];
    expect(command.payload.data).toEqual({ name: "Heading" });
    expect(Object.hasOwn(command.payload.data, "hidden")).toBe(false);
    // As after a reload: the field is not cleared.
    expect(getElement(repository)).toMatchObject({
      name: "Heading",
      hidden: true,
    });
  });

  it("checks NaN as the null it is stored as", async () => {
    const { repository, session, updateElement } = await setup();

    const result = await updateElement({ x: Number.NaN });

    expect(result).toMatchObject({ valid: false });
    expect(session.submitCommand).not.toHaveBeenCalled();
    expect(getElement(repository).x).toBe(0);
  });
});

describe("collectNonJsonFields", () => {
  const collect = (value) => {
    const fields = new Set();
    collectNonJsonFields(value, "payload", fields);
    return [...fields].sort();
  };

  it("names the fields whose values JSON drops or changes", () => {
    expect(
      collect({
        kept: { text: "a", count: 1, flag: false, empty: null },
        missing: undefined,
        ratio: Number.NaN,
        limit: Infinity,
        when: new Date(0),
        list: [1, undefined],
      }),
    ).toEqual(["limit", "list", "missing", "ratio", "when"]);
  });

  it("names nothing in a JSON-safe value that uses one object twice", () => {
    const shared = { value: "same" };

    expect(collect({ first: shared, second: [shared] })).toEqual([]);
  });

  it("names a field that leads back into its own value", () => {
    const cyclic = { name: "loop" };
    cyclic.self = cyclic;

    expect(collect({ data: cyclic })).toEqual(["self"]);
  });
});
