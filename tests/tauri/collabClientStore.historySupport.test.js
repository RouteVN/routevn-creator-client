import { describe, expect, it } from "vitest";
import {
  inspectBootstrapHistorySupport,
  isCurrentMainCheckpointCompatibleWithHistory,
} from "../../src/deps/services/tauri/collabClientStore.js";

const projectId = "project-1";

const createCommittedEvent = ({
  committedId,
  id,
  partition,
  type,
  payload = {},
}) => ({
  committedId,
  id,
  projectId,
  partition,
  type,
  schemaVersion: 1,
  payload,
  clientTs: committedId,
  serverTs: committedId,
  createdAt: committedId,
});

const createDraftEvent = ({ id, partition, type, payload = {} }) => ({
  id,
  partition,
  type,
  schemaVersion: 1,
  payload,
  clientTs: 1,
  createdAt: 1,
});

describe("inspectBootstrapHistorySupport", () => {
  it("accepts empty history for new project initialization", () => {
    expect(
      inspectBootstrapHistorySupport({
        committedEvents: [],
        draftEvents: [],
      }),
    ).toEqual({
      supported: true,
      reason: "history_empty",
    });
  });

  it("accepts the current supported history layout", () => {
    expect(
      inspectBootstrapHistorySupport({
        committedEvents: [
          createCommittedEvent({
            committedId: 1,
            id: "bootstrap-1",
            partition: "m",
            type: "project.create",
            payload: {
              state: {
                scenes: {
                  items: {},
                  tree: [],
                },
              },
            },
          }),
          createCommittedEvent({
            committedId: 2,
            id: "line-1",
            partition: "s:scene-1",
            type: "line.create",
            payload: {
              sectionId: "section-1",
              lines: [],
              index: 0,
            },
          }),
        ],
        draftEvents: [
          createDraftEvent({
            id: "draft-1",
            partition: "m",
            type: "scene.update",
            payload: {
              sceneId: "scene-1",
              data: {
                name: "Scene 1",
              },
            },
          }),
        ],
      }),
    ).toEqual({
      supported: true,
      reason: "history_valid",
    });
  });

  it("accepts a draft bootstrap for local-only project history", () => {
    expect(
      inspectBootstrapHistorySupport({
        committedEvents: [],
        draftEvents: [
          createDraftEvent({
            id: "bootstrap-draft",
            partition: "m",
            type: "project.create",
            payload: {
              state: {
                scenes: {
                  items: {},
                  tree: [],
                },
              },
            },
          }),
        ],
      }),
    ).toEqual({
      supported: true,
      reason: "history_valid",
    });
  });

  it("rejects missing committed bootstrap history", () => {
    expect(
      inspectBootstrapHistorySupport({
        committedEvents: [
          createCommittedEvent({
            committedId: 1,
            id: "line-1",
            partition: "s:scene-1",
            type: "line.create",
            payload: {
              sectionId: "section-1",
              lines: [],
              index: 0,
            },
          }),
        ],
        draftEvents: [],
      }),
    ).toEqual({
      supported: false,
      reason: "missing_bootstrap_event",
    });
  });

  it("rejects misordered or duplicate bootstrap history", () => {
    expect(
      inspectBootstrapHistorySupport({
        draftEvents: [
          createDraftEvent({
            id: "line-1",
            partition: "s:scene-1",
            type: "line.create",
            payload: {
              sectionId: "section-1",
              lines: [],
              index: 0,
            },
          }),
          createDraftEvent({
            id: "bootstrap-1",
            partition: "m",
            type: "project.create",
            payload: {
              state: {
                scenes: {
                  items: {},
                  tree: [],
                },
              },
            },
          }),
        ],
      }),
    ).toEqual({
      supported: false,
      reason: "misordered_bootstrap_draft_event",
    });

    expect(
      inspectBootstrapHistorySupport({
        committedEvents: [
          createCommittedEvent({
            committedId: 1,
            id: "line-1",
            partition: "s:scene-1",
            type: "line.create",
            payload: {
              sectionId: "section-1",
              lines: [],
              index: 0,
            },
          }),
          createCommittedEvent({
            committedId: 2,
            id: "bootstrap-1",
            partition: "m",
            type: "project.create",
            payload: {
              state: {
                scenes: {
                  items: {},
                  tree: [],
                },
              },
            },
          }),
        ],
      }),
    ).toEqual({
      supported: false,
      reason: "misordered_bootstrap_committed_event",
    });

    expect(
      inspectBootstrapHistorySupport({
        committedEvents: [
          createCommittedEvent({
            committedId: 1,
            id: "bootstrap-1",
            partition: "m",
            type: "project.create",
          }),
          createCommittedEvent({
            committedId: 2,
            id: "bootstrap-2",
            partition: "m",
            type: "project.create",
          }),
        ],
      }),
    ).toEqual({
      supported: false,
      reason: "multiple_bootstrap_events",
    });
  });

  it("accepts checkpoint-backed local-only history when current history stats match", () => {
    expect(
      isCurrentMainCheckpointCompatibleWithHistory({
        checkpoint: {
          viewVersion: "1",
          lastCommittedId: 8,
          meta: {
            historyStats: {
              committedCount: 0,
              latestCommittedId: 0,
              draftCount: 8,
              latestDraftClock: 8,
            },
          },
        },
        historyStats: {
          committedCount: 0,
          latestCommittedId: 0,
          draftCount: 8,
          latestDraftClock: 8,
        },
      }),
    ).toBe(true);
  });
});
