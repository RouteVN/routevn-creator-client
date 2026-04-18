import { describe, expect, it, vi } from "vitest";
import { loadRepositoryEvents } from "../../src/deps/services/tauri/collabClientStore.js";

describe("loadRepositoryEvents", () => {
  it("skips committed replay when there are no drafts", async () => {
    const events = await loadRepositoryEvents({
      projectId: "project-1",
      store: {
        listCommittedAfter: async () => [
          {
            id: "event-1",
            committedId: 1,
            partition: "m:s:scene-1",
            projectId: "project-1",
            userId: "user-1",
            type: "section.create",
            schemaVersion: 1,
            payload: {
              sceneId: "scene-1",
              sectionId: "section-1",
              data: {
                name: "Section 1",
              },
            },
            serverTs: 1000,
            meta: {},
          },
        ],
        listDraftsOrdered: async () => [],
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "event-1",
      partition: "m:s:scene-1",
      projectId: "project-1",
      type: "section.create",
      payload: {
        sceneId: "scene-1",
        sectionId: "section-1",
      },
    });
  });

  it("reports progress while replaying local drafts", async () => {
    const progressUpdates = [];

    const events = await loadRepositoryEvents({
      projectId: "project-1",
      onProgress: (payload) => {
        progressUpdates.push(payload);
      },
      store: {
        listCommittedAfter: async () => [],
        listDraftsOrdered: async () => [
          {
            id: "draft-1",
            partition: "m:s:scene-1",
            projectId: "project-1",
            userId: "user-1",
            type: "scene.create",
            schemaVersion: 1,
            payload: {
              sceneId: "scene-1",
              data: {
                name: "Scene 1",
              },
            },
            clientTs: 1000,
            createdAt: 1000,
            meta: {},
          },
          {
            id: "draft-2",
            partition: "m:s:scene-1",
            projectId: "project-1",
            userId: "user-1",
            type: "section.create",
            schemaVersion: 1,
            payload: {
              sceneId: "scene-1",
              sectionId: "section-1",
              data: {
                name: "Section 1",
              },
            },
            clientTs: 1001,
            createdAt: 1001,
            meta: {},
          },
        ],
        applySubmitResult: async () => {},
      },
    });

    expect(events).toHaveLength(2);
    expect(progressUpdates.at(-1)).toMatchObject({
      phase: "read_project_events",
      current: 2,
      total: 2,
    });
  });

  it("rejects only the first invalid draft in a batch and continues with the suffix", async () => {
    const progressUpdates = [];
    const applySubmitResult = vi.fn(async () => {});

    const events = await loadRepositoryEvents({
      projectId: "project-1",
      onProgress: (payload) => {
        progressUpdates.push(payload);
      },
      store: {
        listCommittedAfter: async () => [],
        listDraftsOrdered: async () => [
          {
            id: "draft-1",
            partition: "m:s:scene-1",
            projectId: "project-1",
            userId: "user-1",
            type: "scene.create",
            schemaVersion: 1,
            payload: {
              sceneId: "scene-1",
              data: {
                name: "Scene 1",
              },
            },
            clientTs: 1000,
            createdAt: 1000,
            meta: {},
          },
          {
            id: "draft-2",
            partition: "m:s:missing-scene",
            projectId: "project-1",
            userId: "user-1",
            type: "section.create",
            schemaVersion: 1,
            payload: {
              sceneId: "missing-scene",
              sectionId: "section-missing",
              data: {
                name: "Missing Section",
              },
            },
            clientTs: 1001,
            createdAt: 1001,
            meta: {},
          },
          {
            id: "draft-3",
            partition: "m:s:scene-1",
            projectId: "project-1",
            userId: "user-1",
            type: "section.create",
            schemaVersion: 1,
            payload: {
              sceneId: "scene-1",
              sectionId: "section-1",
              data: {
                name: "Section 1",
              },
            },
            clientTs: 1002,
            createdAt: 1002,
            meta: {},
          },
        ],
        applySubmitResult,
      },
    });

    expect(events.map((event) => event.id)).toEqual(["draft-1", "draft-3"]);
    expect(applySubmitResult).toHaveBeenCalledTimes(1);
    expect(applySubmitResult).toHaveBeenCalledWith({
      result: {
        id: "draft-2",
        status: "rejected",
        reason: "precondition_validation_failed",
        message: "payload.sceneId must reference an existing scene",
      },
    });
    expect(progressUpdates.at(-1)).toMatchObject({
      phase: "read_project_events",
      current: 3,
      total: 3,
    });
  });
});
