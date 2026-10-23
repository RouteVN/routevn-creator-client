import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRepositoryEventsFromClientStore } from "../../src/deps/services/shared/collab/clientStoreHistory.js";
import {
  createProjectCreateRepositoryEvent,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../../src/deps/services/shared/collab/partitions.js";

// Records how many events each replay applies while a test sets `log`.
const replayRecorder = vi.hoisted(() => ({ log: undefined }));

vi.mock(
  "../../src/deps/services/shared/projectRepository.js",
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      applyRepositoryEventsToRepositoryState: (args) => {
        replayRecorder.log?.push(args.events.length);
        return actual.applyRepositoryEventsToRepositoryState(args);
      },
    };
  },
);

const projectId = "project-1";
const sceneId = "scene-1";
const sectionId = "section-1";
const lineId = "line-1";

afterEach(() => {
  replayRecorder.log = undefined;
  vi.restoreAllMocks();
});

const createDraft = ({
  id,
  partition = mainScenePartitionFor(sceneId),
  type,
  payload,
  clientTs,
  schemaVersion = 1,
}) => ({
  id,
  partition,
  projectId,
  userId: "user-1",
  type,
  schemaVersion,
  payload,
  clientTs,
  createdAt: clientTs,
  meta: {},
});

const createBootstrapDraft = () => ({
  ...createProjectCreateRepositoryEvent({
    projectId,
    state: initialProjectData,
    clientTs: 1,
  }),
  createdAt: 1,
});

// A scene with one section and one line, built by drafts that apply.
const createSceneDrafts = () => [
  createDraft({
    id: "scene-create",
    type: "scene.create",
    payload: { sceneId, data: { name: "Scene One" } },
    clientTs: 2,
  }),
  createDraft({
    id: "section-create",
    type: "section.create",
    payload: { sceneId, sectionId, data: { name: "Section One" } },
    clientTs: 3,
  }),
  createDraft({
    id: "line-create",
    partition: scenePartitionFor(sceneId),
    type: "line.create",
    payload: {
      sectionId,
      lines: [{ lineId, data: { actions: {} } }],
      position: "last",
    },
    clientTs: 4,
  }),
];

const createSceneRename = ({ id, name, clientTs, schemaVersion }) =>
  createDraft({
    id,
    type: "scene.update",
    payload: { sceneId, data: { name } },
    clientTs,
    schemaVersion,
  });

// Fails creator-model validation, which reports the failing command index.
const createInvalidLineUpdate = ({ id, clientTs }) =>
  createDraft({
    id,
    partition: scenePartitionFor(sceneId),
    type: "line.update_actions",
    payload: { lineId, data: {}, unsupportedField: true },
    clientTs,
  });

const loadHistory = async ({ committed = [], drafts = [] }) => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const skippedDrafts = [];
  const events = await loadRepositoryEventsFromClientStore({
    store: {
      listCommittedAfter: vi.fn(async () => committed),
      listDraftsOrdered: vi.fn(async () => drafts),
    },
    projectId,
    onSkippedDraft: (skippedDraft) => {
      skippedDrafts.push(skippedDraft);
    },
  });

  return {
    eventIds: events.map((event) => event.id),
    skippedDrafts,
  };
};

describe("clientStoreHistory", () => {
  it("fails without deleting an invalid project bootstrap draft", async () => {
    const applySubmitResult = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const store = {
      applySubmitResult,
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => [
        {
          id: "project-create:project-1",
          partition: "m",
          projectId: "project-1",
          type: "project.create",
          schemaVersion: 1,
          payload: {
            state: undefined,
          },
          clientTs: 1,
          createdAt: 1,
        },
      ]),
    };

    await expect(
      loadRepositoryEventsFromClientStore({
        store,
        projectId: "project-1",
      }),
    ).rejects.toBeDefined();
    expect(applySubmitResult).not.toHaveBeenCalled();
  });

  it("leaves out only the draft that fails without a command index", async () => {
    const { eventIds, skippedDrafts } = await loadHistory({
      drafts: [
        createBootstrapDraft(),
        ...createSceneDrafts(),
        createSceneRename({ id: "rename-1", name: "Scene Two", clientTs: 5 }),
        createSceneRename({ id: "rename-2", name: "Scene Three", clientTs: 6 }),
        createSceneRename({
          id: "malformed-rename",
          name: "Scene Four",
          clientTs: 7,
          schemaVersion: 0,
        }),
        createSceneRename({ id: "rename-3", name: "Scene Five", clientTs: 8 }),
      ],
    });

    expect(eventIds).toEqual([
      "project-create:project-1",
      "scene-create",
      "section-create",
      "line-create",
      "rename-1",
      "rename-2",
      "rename-3",
    ]);
    expect(skippedDrafts).toEqual([
      {
        draftId: "malformed-rename",
        type: "scene.update",
        partition: mainScenePartitionFor(sceneId),
        sceneId,
        error: {
          code: "validation_failed",
          message: "repository event schemaVersion must be a positive integer",
        },
      },
    ]);
  });

  it("leaves out the draft at a reported command index", async () => {
    const { eventIds, skippedDrafts } = await loadHistory({
      drafts: [
        createBootstrapDraft(),
        ...createSceneDrafts(),
        createSceneRename({ id: "rename-1", name: "Scene Two", clientTs: 5 }),
        createInvalidLineUpdate({ id: "invalid-line-update", clientTs: 6 }),
        createSceneRename({ id: "rename-2", name: "Scene Three", clientTs: 7 }),
      ],
    });

    expect(eventIds).toEqual([
      "project-create:project-1",
      "scene-create",
      "section-create",
      "line-create",
      "rename-1",
      "rename-2",
    ]);
    expect(skippedDrafts.map(({ draftId }) => draftId)).toEqual([
      "invalid-line-update",
    ]);
  });

  it("yields to the UI between a failed replay and the replay that finds the failed draft", async () => {
    replayRecorder.log = [];
    const originalSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(
      (callback, delay, ...args) => {
        if (delay === 0) {
          replayRecorder.log.push("yield");
        }
        return originalSetTimeout(callback, delay, ...args);
      },
    );

    const { eventIds } = await loadHistory({
      drafts: [
        createBootstrapDraft(),
        ...createSceneDrafts(),
        createSceneRename({ id: "rename-1", name: "Scene Two", clientTs: 5 }),
        createInvalidLineUpdate({ id: "invalid-line-update", clientTs: 6 }),
        createSceneRename({ id: "rename-2", name: "Scene Three", clientTs: 7 }),
      ],
    });

    expect(eventIds).not.toContain("invalid-line-update");
    // The empty start state, all 7 drafts failing at the sixth, then the 5
    // drafts before it.
    expect(replayRecorder.log.slice(0, 4)).toEqual([0, 7, "yield", 5]);
  });

  it("leaves out each of several invalid drafts and keeps the rest", async () => {
    const { eventIds, skippedDrafts } = await loadHistory({
      drafts: [
        createBootstrapDraft(),
        ...createSceneDrafts(),
        createInvalidLineUpdate({ id: "invalid-line-update", clientTs: 5 }),
        createSceneRename({ id: "rename-1", name: "Scene Two", clientTs: 6 }),
        createSceneRename({
          id: "malformed-rename",
          name: "Scene Three",
          clientTs: 7,
          schemaVersion: 0,
        }),
        createDraft({
          id: "missing-scene-create",
          partition: mainScenePartitionFor("scene-2"),
          type: "section.create",
          payload: {
            sceneId: "scene-2",
            sectionId: "section-2",
            data: { name: "Section Two" },
          },
          clientTs: 8,
        }),
        createSceneRename({ id: "rename-2", name: "Scene Four", clientTs: 9 }),
      ],
    });

    expect(eventIds).toEqual([
      "project-create:project-1",
      "scene-create",
      "section-create",
      "line-create",
      "rename-1",
      "rename-2",
    ]);
    expect(
      skippedDrafts.map(({ draftId, sceneId: draftSceneId }) => ({
        draftId,
        sceneId: draftSceneId,
      })),
    ).toEqual([
      { draftId: "invalid-line-update", sceneId },
      { draftId: "malformed-rename", sceneId },
      // The draft's scene does not exist, so it has no scene.
      { draftId: "missing-scene-create", sceneId: undefined },
    ]);
  });

  it("refuses to leave out an invalid project.create draft found without a command index", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onSkippedDraft = vi.fn();
    const bootstrapDraft = {
      ...createBootstrapDraft(),
      schemaVersion: 0,
    };

    await expect(
      loadRepositoryEventsFromClientStore({
        store: {
          listCommittedAfter: vi.fn(async () => []),
          listDraftsOrdered: vi.fn(async () => [
            bootstrapDraft,
            ...createSceneDrafts(),
          ]),
        },
        projectId,
        onSkippedDraft,
      }),
    ).rejects.toThrow(
      "repository event schemaVersion must be a positive integer",
    );
    expect(onSkippedDraft).not.toHaveBeenCalled();
  });

  it("reports a left-out line command at its line's scene", async () => {
    const { skippedDrafts } = await loadHistory({
      drafts: [
        createBootstrapDraft(),
        ...createSceneDrafts(),
        createInvalidLineUpdate({ id: "invalid-line-update", clientTs: 5 }),
        createDraft({
          id: "invalid-line-delete",
          partition: "m",
          type: "line.delete",
          payload: { lineIds: [lineId], unsupportedField: true },
          clientTs: 6,
        }),
      ],
    });

    expect(skippedDrafts).toEqual([
      {
        draftId: "invalid-line-update",
        type: "line.update_actions",
        partition: scenePartitionFor(sceneId),
        sceneId,
        error: {
          code: "payload_validation_failed",
          message: "payload.unsupportedField is not allowed",
        },
      },
      {
        draftId: "invalid-line-delete",
        type: "line.delete",
        partition: "m",
        sceneId,
        error: {
          code: "payload_validation_failed",
          message: "payload.unsupportedField is not allowed",
        },
      },
    ]);
  });

  it("reports an edit of a deleted line at the scene of the section that last held it", async () => {
    // A save stored its line delete but not the rest, and the next save
    // edited the deleted line. The edit is in the main partition, so only the
    // line's last section can give its scene.
    const { eventIds, skippedDrafts } = await loadHistory({
      drafts: [
        createBootstrapDraft(),
        ...createSceneDrafts(),
        createDraft({
          id: "line-delete",
          partition: scenePartitionFor(sceneId),
          type: "line.delete",
          payload: { lineIds: [lineId] },
          clientTs: 5,
        }),
        createDraft({
          id: "deleted-line-update",
          partition: "m",
          type: "line.update_actions",
          payload: { lineId, data: {} },
          clientTs: 6,
        }),
      ],
    });

    expect(eventIds.at(-1)).toBe("line-delete");
    expect(skippedDrafts).toEqual([
      expect.objectContaining({
        draftId: "deleted-line-update",
        sceneId,
      }),
    ]);
  });

  it("reports an edit in a deleted section at the scene of its partition", async () => {
    const { skippedDrafts } = await loadHistory({
      drafts: [
        createBootstrapDraft(),
        ...createSceneDrafts(),
        createDraft({
          id: "section-delete",
          type: "section.delete",
          payload: { sectionIds: [sectionId] },
          clientTs: 5,
        }),
        createDraft({
          id: "deleted-section-line-update",
          partition: scenePartitionFor(sceneId),
          type: "line.update_actions",
          payload: { lineId, data: {} },
          clientTs: 6,
        }),
      ],
    });

    expect(skippedDrafts).toEqual([
      expect.objectContaining({
        draftId: "deleted-section-line-update",
        sceneId,
      }),
    ]);
  });

  it("does not report drafts of a history without project.create", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Desktop history backed by a main checkpoint has no project.create, so
    // its drafts replay onto an empty project instead of the stored one.
    const { eventIds, skippedDrafts } = await loadHistory({
      drafts: [
        createSceneRename({ id: "rename-1", name: "Scene Two", clientTs: 5 }),
        ...createSceneDrafts(),
      ],
    });

    expect(eventIds).toEqual(["scene-create", "section-create", "line-create"]);
    expect(skippedDrafts).toEqual([]);
  });

  describe("a create that repeats a file or resource the project has", () => {
    const createFileCreate = ({ id, sha256 = "hash-1", clientTs }) =>
      createDraft({
        id,
        partition: "m",
        type: "file.create",
        payload: {
          fileId: "file-1",
          data: { mimeType: "image/png", size: 123, sha256 },
        },
        clientTs,
      });

    it("does not report an identical copy, such as one stored by a double save", async () => {
      const { eventIds, skippedDrafts } = await loadHistory({
        drafts: [
          createBootstrapDraft(),
          ...createSceneDrafts(),
          createFileCreate({ id: "file-create", clientTs: 5 }),
          createFileCreate({ id: "file-create-again", clientTs: 6 }),
          createSceneRename({ id: "rename-1", name: "Scene Two", clientTs: 7 }),
        ],
      });

      expect(eventIds).toEqual([
        "project-create:project-1",
        "scene-create",
        "section-create",
        "line-create",
        "file-create",
        "rename-1",
      ]);
      expect(skippedDrafts).toEqual([]);
    });

    it("does not report an identical copy of a resource create", async () => {
      const createImageCreate = ({ id, clientTs }) =>
        createDraft({
          id,
          partition: "m",
          type: "image.create",
          payload: {
            imageId: "image-1",
            data: { name: "Image One", type: "image", fileId: "file-1" },
          },
          clientTs,
        });

      const { eventIds, skippedDrafts } = await loadHistory({
        drafts: [
          createBootstrapDraft(),
          createFileCreate({ id: "file-create", clientTs: 2 }),
          createImageCreate({ id: "image-create", clientTs: 3 }),
          createImageCreate({ id: "image-create-again", clientTs: 4 }),
        ],
      });

      expect(eventIds).toEqual([
        "project-create:project-1",
        "file-create",
        "image-create",
      ]);
      expect(skippedDrafts).toEqual([]);
    });

    it("reports a copy whose file differs from the one the project has", async () => {
      const { eventIds, skippedDrafts } = await loadHistory({
        drafts: [
          createBootstrapDraft(),
          createFileCreate({ id: "file-create", clientTs: 2 }),
          createFileCreate({
            id: "other-file-create",
            sha256: "hash-2",
            clientTs: 3,
          }),
        ],
      });

      expect(eventIds).toEqual(["project-create:project-1", "file-create"]);
      expect(skippedDrafts).toEqual([
        expect.objectContaining({
          draftId: "other-file-create",
          type: "file.create",
          error: expect.objectContaining({
            message: expect.stringContaining(
              "payload.fileId must not already exist",
            ),
          }),
        }),
      ]);
    });
  });

  it("does not report a draft that repeats a committed event", async () => {
    const committed = [createBootstrapDraft(), ...createSceneDrafts()].map(
      (event, index) => ({
        ...event,
        committedId: index + 1,
        serverTs: index + 1,
      }),
    );

    const { eventIds, skippedDrafts } = await loadHistory({
      committed,
      drafts: [
        createSceneDrafts()[2],
        createSceneRename({ id: "rename-1", name: "Scene Two", clientTs: 5 }),
      ],
    });

    expect(eventIds).toEqual([
      "project-create:project-1",
      "scene-create",
      "section-create",
      "line-create",
      "rename-1",
    ]);
    expect(skippedDrafts).toEqual([]);
  });
});
