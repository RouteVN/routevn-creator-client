import { describe, expect, it } from "vitest";
import { loadRepositoryEvents } from "../../src/deps/services/tauri/collabClientStore.js";

describe("loadRepositoryEvents", () => {
  it("skips committed replay when there are no drafts", async () => {
    const events = await loadRepositoryEvents({
      projectId: "project-1",
      store: {
        _debug: {
          getCommitted: async () => [
            {
              id: "event-1",
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
          getDrafts: async () => [],
        },
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
        _debug: {
          getCommitted: async () => [],
          getDrafts: async () => [
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
        },
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
});
