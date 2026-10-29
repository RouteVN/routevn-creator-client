import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCommandApi,
  SLOW_CHANGE_REPORT_MS,
} from "../../src/deps/services/shared/commandApi.js";
import {
  createProjectCreateRepositoryEvent,
  createProjectRepository,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import {
  MAIN_VIEW_NAME,
  MAIN_VIEW_VERSION,
  createMainProjectionState,
} from "../../src/deps/services/shared/projectRepositoryViews/shared.js";

// A change is checked against the project state, saved, then applied. Changes
// made while another one is saving must be checked against the state it
// leaves, or a save sent twice stores its files twice.

const createStore = () => ({
  appendEvents: vi.fn(async () => {}),
  loadMaterializedViewCheckpoint: vi.fn(async () => undefined),
  saveMaterializedViewCheckpoint: vi.fn(async () => {}),
  deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
});

// Two projects, as the repository service holds them: the cached repository
// is the open project's only while the route names that project, and a
// repository ensured for the route opens the route's project.
const setup = async ({ repositoryOptions } = {}) => {
  const repositories = {};
  for (const projectId of ["project-1", "project-2"]) {
    const options = {
      projectId,
      store: createStore(),
      events: [],
      historyLoaded: true,
    };
    if (projectId === "project-1") {
      Object.assign(options, repositoryOptions);
    }
    repositories[projectId] = await createProjectRepository(options);
  }
  let routeProjectId = "project-1";
  let openProjectId = "project-1";
  const storedCommands = [];
  const store = (command) => {
    storedCommands.push(structuredClone(command));
    return command.id;
  };
  const session = {
    getActor: () => ({ userId: "user-1", clientId: "client-1" }),
    submitCommand: vi.fn(async (command) => store(command)),
    submitCommands: vi.fn(async (commands) => commands.map(store)),
  };
  const ensureCommandSessionForProject = vi.fn(async () => session);
  let index = 0;
  const errorTracker = { capture: vi.fn() };
  const api = createCommandApi({
    idGenerator: () => `id-${++index}`,
    now: () => 1,
    getCurrentProjectId: () => openProjectId ?? routeProjectId,
    getCachedRepository: () => {
      if (!openProjectId || openProjectId !== routeProjectId) {
        throw new Error("Repository not initialized.");
      }
      return repositories[openProjectId];
    },
    getCurrentRepository: async () => {
      if (!routeProjectId) {
        throw new Error("No project selected (missing ?p= in URL)");
      }
      openProjectId = routeProjectId;
      return repositories[openProjectId];
    },
    getOpenRepository: () => repositories[openProjectId],
    ensureCommandSessionForProject,
    getOrCreateLocalActor: () => ({ userId: "user-1", clientId: "client-1" }),
    storyBasePartitionFor: () => "m",
    storyScenePartitionFor: () => "m",
    scenePartitionFor: () => "s:test",
    resourceTypePartitionFor: () => "m",
    errorTracker,
  });
  const routeTo = (projectId) => {
    routeProjectId = projectId;
  };
  const closeOpenProject = () => {
    openProjectId = undefined;
  };

  return {
    api,
    repository: repositories["project-1"],
    otherRepository: repositories["project-2"],
    session,
    ensureCommandSessionForProject,
    storedCommands,
    errorTracker,
    routeTo,
    closeOpenProject,
  };
};

// Holds the next save until `finish` is called.
const holdNextSave = (session) => {
  const submit = session.submitCommands.getMockImplementation();
  let finish;
  const held = new Promise((resolve) => {
    finish = resolve;
  });
  session.submitCommands.mockImplementationOnce(async (commands) => {
    await held;
    return submit(commands);
  });
  return () => finish();
};

const fileRecord = (id, mimeType) => ({
  id,
  mimeType,
  size: 1,
  sha256: "a".repeat(64),
});

const createImageOne = (api) =>
  api.createImage({
    imageId: "image-1",
    data: {
      type: "image",
      fileId: "file-1",
      thumbnailFileId: "thumbnail-1",
      name: "Image One",
      width: 960,
      height: 540,
    },
    fileRecords: [
      fileRecord("file-1", "image/png"),
      fileRecord("thumbnail-1", "image/webp"),
    ],
  });

// The edit dialog keeps the uploaded file until the change is saved, so each
// Save sends the same file records.
const replaceImageOneFile = (api) =>
  api.updateImage({
    imageId: "image-1",
    fileRecords: [
      fileRecord("file-2", "image/png"),
      fileRecord("thumbnail-2", "image/webp"),
    ],
    data: {
      fileId: "file-2",
      thumbnailFileId: "thumbnail-2",
      name: "Image One",
      width: 1920,
      height: 1080,
    },
  });

const describeCommand = ({ type, payload }) =>
  `${type} ${payload.fileId ?? payload.imageId}`;

describe("project changes run one at a time", () => {
  it("stores the files of a save sent twice at once only once", async () => {
    const { api, repository, storedCommands } = await setup();
    await createImageOne(api);
    storedCommands.length = 0;

    const results = await Promise.allSettled([
      replaceImageOneFile(api),
      replaceImageOneFile(api),
    ]);

    expect(storedCommands.map(describeCommand)).toEqual([
      "file.create file-2",
      "file.create thumbnail-2",
      "image.update image-1",
      "image.update image-1",
    ]);
    expect(results).toEqual([
      { status: "fulfilled", value: expect.objectContaining({ valid: true }) },
      { status: "fulfilled", value: expect.objectContaining({ valid: true }) },
    ]);
    expect(repository.getState().images.items["image-1"]).toMatchObject({
      fileId: "file-2",
      thumbnailFileId: "thumbnail-2",
    });
  });

  it("runs the next change after a change that fails", async () => {
    const { api, repository, session } = await setup();
    session.submitCommands.mockRejectedValueOnce(new Error("disk full"));

    const results = await Promise.allSettled([
      createImageOne(api),
      createImageOne(api),
    ]);

    expect(results[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "disk full" }),
    });
    expect(results[1]).toEqual({ status: "fulfilled", value: "image-1" });
    expect(repository.getState().images.items["image-1"]).toMatchObject({
      fileId: "file-1",
    });
  });

  it.each([
    ["another project", "project-2"],
    ["the project list", undefined],
  ])(
    "makes a change that waits while the route moves to %s in the project it was made in",
    async (_destination, routeProjectId) => {
      const {
        api,
        repository,
        otherRepository,
        session,
        ensureCommandSessionForProject,
        storedCommands,
        errorTracker,
        routeTo,
      } = await setup();
      const finishFirst = holdNextSave(session);

      const first = createImageOne(api);
      const second = replaceImageOneFile(api);
      await vi.waitFor(() => expect(session.submitCommands).toHaveBeenCalled());
      // The route changes before the project it leaves is closed.
      routeTo(routeProjectId);
      finishFirst();

      await expect(first).resolves.toBe("image-1");
      await expect(second).resolves.toMatchObject({ valid: true });
      expect(storedCommands.map(describeCommand)).toEqual([
        "file.create file-1",
        "file.create thumbnail-1",
        "image.create image-1",
        "file.create file-2",
        "file.create thumbnail-2",
        "image.update image-1",
      ]);
      expect(repository.getState().images.items["image-1"]).toMatchObject({
        fileId: "file-2",
      });
      expect(otherRepository.getState().images.items).toEqual({});
      expect(
        ensureCommandSessionForProject.mock.calls.map(
          ([projectId]) => projectId,
        ),
      ).toEqual(["project-1", "project-1"]);
      expect(errorTracker.capture).not.toHaveBeenCalled();
    },
  );

  it("refuses and reports a change whose project was closed before it ran", async () => {
    const {
      api,
      repository,
      otherRepository,
      session,
      storedCommands,
      errorTracker,
      routeTo,
      closeOpenProject,
    } = await setup();
    const finishFirst = holdNextSave(session);

    const first = createImageOne(api);
    const second = replaceImageOneFile(api);
    await vi.waitFor(() => expect(session.submitCommands).toHaveBeenCalled());
    routeTo("project-2");
    closeOpenProject();
    finishFirst();

    await expect(first).resolves.toBe("image-1");
    await expect(second).rejects.toMatchObject({ name: "ProjectClosedError" });
    expect(storedCommands.map(describeCommand)).toEqual([
      "file.create file-1",
      "file.create thumbnail-1",
      "image.create image-1",
    ]);
    expect(repository.getState().images.items["image-1"]).toMatchObject({
      fileId: "file-1",
    });
    expect(otherRepository.getState().images.items).toEqual({});
    expect(errorTracker.capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "ProjectClosedError" }),
      { operation: "projectCommand.projectClosed" },
    );
  });

  it("closes a project after the changes made before, and refuses one made while it closes", async () => {
    const {
      api,
      repository,
      session,
      storedCommands,
      errorTracker,
      routeTo,
      closeOpenProject,
    } = await setup();
    const finishFirst = holdNextSave(session);
    const first = createImageOne(api);

    let imagesWhenClosing;
    let finishClosing;
    const closing = api.runAfterChanges(
      () =>
        new Promise((resolve) => {
          imagesWhenClosing = Object.keys(repository.getState().images.items);
          finishClosing = () => {
            closeOpenProject();
            resolve();
          };
        }),
    );
    routeTo(undefined);
    finishFirst();
    await expect(first).resolves.toBe("image-1");
    await vi.waitFor(() => expect(finishClosing).toBeTypeOf("function"));
    expect(imagesWhenClosing).toEqual(["image-1"]);

    // Made while the project closes, as by a page saving late.
    const late = replaceImageOneFile(api);
    finishClosing();
    await closing;

    await expect(late).rejects.toMatchObject({ name: "ProjectClosedError" });
    expect(storedCommands.map(describeCommand)).toEqual([
      "file.create file-1",
      "file.create thumbnail-1",
      "image.create image-1",
    ]);
    expect(errorTracker.capture).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: "ProjectClosedError" }),
      { operation: "projectCommand.projectClosed" },
    );
  });

  it("waits for every change made so far, until the last one has finished", async () => {
    const { api, repository, session } = await setup();
    const finishFirst = holdNextSave(session);
    createImageOne(api);
    const second = replaceImageOneFile(api);

    let waited = false;
    const waiting = api.waitForChanges().then(() => {
      waited = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(waited).toBe(false);

    finishFirst();
    await waiting;
    expect(waited).toBe(true);
    await expect(second).resolves.toMatchObject({ valid: true });
    expect(repository.getState().images.items["image-1"]).toMatchObject({
      fileId: "file-2",
    });
  });

  it("waits for a change made while it waits", async () => {
    const { api, repository, session } = await setup();
    const finishFirst = holdNextSave(session);
    const first = createImageOne(api);

    const waiting = api.waitForChanges();
    // A change made once the first one is saved, as a page saving after another.
    const second = first.then(() => replaceImageOneFile(api));
    finishFirst();
    await waiting;

    expect(repository.getState().images.items["image-1"]).toMatchObject({
      fileId: "file-2",
    });
    await expect(second).resolves.toMatchObject({ valid: true });
  });

  describe("a change that keeps running", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("is reported with its step once it has run for the report time, and a quick one is not", async () => {
      const { api, repository, session, errorTracker } = await setup();
      vi.useFakeTimers();
      await createImageOne(api);
      await vi.advanceTimersByTimeAsync(SLOW_CHANGE_REPORT_MS);
      expect(errorTracker.capture).not.toHaveBeenCalled();

      const finishSave = holdNextSave(session);
      const slow = replaceImageOneFile(api);
      await vi.advanceTimersByTimeAsync(SLOW_CHANGE_REPORT_MS - 1);
      expect(errorTracker.capture).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(errorTracker.capture).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          name: "SlowProjectChangeError",
          message: `Project change updateImage is still running after 60 s, at step save, revision ${repository.getRevision()}`,
        }),
        { operation: "projectCommand.slowChange" },
      );

      await vi.advanceTimersByTimeAsync(15000);
      finishSave();
      await expect(slow).resolves.toMatchObject({ valid: true });
      expect(errorTracker.capture).toHaveBeenCalledTimes(2);
      expect(errorTracker.capture).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: "SlowProjectChangeFinished",
          message: "Project change updateImage finished after 75 s",
        }),
        { operation: "projectCommand.slowChange" },
      );
    });

    it("names the history load when the first change of a session waits for it", async () => {
      let finishHistoryLoad;
      const historyLoad = new Promise((resolve) => {
        finishHistoryLoad = resolve;
      });
      const { api, errorTracker } = await setup({
        repositoryOptions: {
          events: undefined,
          historyLoaded: false,
          loadEvents: async () => {
            await historyLoad;
            return [];
          },
        },
      });
      vi.useFakeTimers();

      const slow = createImageOne(api);
      await vi.advanceTimersByTimeAsync(SLOW_CHANGE_REPORT_MS);
      expect(errorTracker.capture).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          name: "SlowProjectChangeError",
          message: expect.stringMatching(
            /^Project change createImage is still running after 60 s, at step apply-loading-history, revision \d+$/,
          ),
        }),
        { operation: "projectCommand.slowChange" },
      );

      finishHistoryLoad();
      await expect(slow).resolves.toBe("image-1");
    });

    // A change that names a scene loads the history while it reads the
    // scene, before it is saved.
    it("names the history load when the first change of a session reads a scene and waits for it", async () => {
      const state = structuredClone(initialProjectData);
      state.scenes.items["scene-1"] = {
        id: "scene-1",
        type: "scene",
        name: "Scene One",
      };
      state.scenes.tree.push({ id: "scene-1" });
      let finishHistoryLoad;
      const historyLoad = new Promise((resolve) => {
        finishHistoryLoad = resolve;
      });
      const store = createStore();
      store.loadMaterializedViewCheckpoint.mockImplementation(
        async ({ viewName }) =>
          viewName === MAIN_VIEW_NAME
            ? {
                viewName,
                viewVersion: MAIN_VIEW_VERSION,
                partition: "m",
                lastCommittedId: 1,
                value: createMainProjectionState(structuredClone(state)),
              }
            : undefined,
      );
      const { api, repository, errorTracker } = await setup({
        repositoryOptions: {
          store,
          events: undefined,
          historyLoaded: false,
          initialRevision: 1,
          historyStats: {
            committedCount: 0,
            latestCommittedId: 0,
            draftCount: 1,
            latestDraftClock: 1,
          },
          loadEvents: async () => {
            await historyLoad;
            return [
              createProjectCreateRepositoryEvent({
                projectId: "project-1",
                state,
                commandId: "project-create-1",
                clientTs: 1,
              }),
            ];
          },
        },
      });
      vi.useFakeTimers();

      const slow = api.updateSceneItem({
        sceneId: "scene-1",
        data: { name: "Scene Two" },
      });
      await vi.advanceTimersByTimeAsync(SLOW_CHANGE_REPORT_MS);
      expect(errorTracker.capture).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          name: "SlowProjectChangeError",
          message:
            "Project change updateSceneItem is still running after 60 s, at step read-context-loading-history, revision 1",
        }),
        { operation: "projectCommand.slowChange" },
      );

      finishHistoryLoad();
      await slow;
      expect(repository.getState().scenes.items["scene-1"].name).toBe(
        "Scene Two",
      );
    });
  });
});
