import { describe, expect, it } from "vitest";
import { planBootstrapHistoryRepair } from "../../src/deps/services/tauri/collabClientStore.js";

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

describe("planBootstrapHistoryRepair", () => {
  it("reorders a misplaced bootstrap event already in committed history", () => {
    const repairPlan = planBootstrapHistoryRepair({
      projectId,
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
    });

    expect(repairPlan).toMatchObject({
      changed: true,
      reason: "reordered_bootstrap_committed_event",
    });
    expect(repairPlan.committedEvents.map((event) => event.id)).toEqual([
      "bootstrap-1",
      "line-1",
    ]);
    expect(
      repairPlan.committedEvents.map((event) => event.committedId),
    ).toEqual([1, 2]);
  });

  it("promotes a draft bootstrap event ahead of committed history", () => {
    const repairPlan = planBootstrapHistoryRepair({
      projectId,
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
      versions: [
        {
          id: "version-1",
          actionIndex: 2,
        },
      ],
    });

    expect(repairPlan).toMatchObject({
      changed: true,
      reason: "promoted_bootstrap_draft",
      versions: [
        {
          id: "version-1",
          actionIndex: 2,
        },
      ],
    });
    expect(repairPlan.committedEvents.map((event) => event.id)).toEqual([
      "bootstrap-draft",
      "line-1",
    ]);
    expect(repairPlan.draftEvents).toEqual([]);
  });

  it("preserves canonical snapshot draft history without rewriting it", () => {
    const snapshotState = {
      scenes: {
        items: {
          "scene-1": {
            id: "scene-1",
            type: "scene",
            name: "Scene 1",
          },
        },
        tree: [{ id: "scene-1" }],
      },
    };
    const repairPlan = planBootstrapHistoryRepair({
      projectId,
      committedEvents: [],
      draftEvents: [
        createDraftEvent({
          id: "bootstrap-draft",
          partition: "m",
          type: "project.create",
          payload: {
            state: snapshotState,
          },
        }),
        createDraftEvent({
          id: "character-1",
          partition: "m",
          type: "character.create",
          payload: {
            characterId: "character-1",
            data: {
              type: "character",
              name: "Dia",
            },
            parentId: "characters-folder",
            index: 0,
          },
        }),
      ],
      mainCheckpointState: snapshotState,
    });

    expect(repairPlan).toEqual({
      changed: false,
      reason: "canonical_snapshot_draft_history",
    });
  });

  it("synthesizes a bootstrap event from the main checkpoint for line-only history", () => {
    const repairPlan = planBootstrapHistoryRepair({
      projectId,
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
      mainCheckpointState: {
        scenes: {
          items: {
            "scene-1": {
              id: "scene-1",
              type: "scene",
              sections: {
                items: {
                  "section-1": {
                    id: "section-1",
                    lines: {
                      items: {},
                      tree: [],
                    },
                  },
                },
                tree: [{ id: "section-1" }],
              },
            },
          },
          tree: [{ id: "scene-1" }],
        },
      },
      versions: [
        {
          id: "version-1",
          actionIndex: 1,
        },
      ],
    });

    expect(repairPlan).toMatchObject({
      changed: true,
      reason: "synthesized_bootstrap_from_main_checkpoint",
      versions: [
        {
          id: "version-1",
          actionIndex: 2,
        },
      ],
    });
    expect(repairPlan.committedEvents[0]).toMatchObject({
      committedId: 1,
      type: "project.create",
      projectId,
    });
    expect(repairPlan.committedEvents[1]).toMatchObject({
      committedId: 2,
      id: "line-1",
    });
  });

  it("refuses to synthesize a bootstrap event when history contains non-line commands", () => {
    const repairPlan = planBootstrapHistoryRepair({
      projectId,
      committedEvents: [
        createCommittedEvent({
          committedId: 1,
          id: "scene-1",
          partition: "m",
          type: "scene.create",
          payload: {
            sceneId: "scene-1",
            index: 0,
          },
        }),
      ],
      mainCheckpointState: {
        scenes: {
          items: {},
          tree: [],
        },
      },
    });

    expect(repairPlan).toMatchObject({
      changed: false,
      reason: "missing_bootstrap_without_safe_recovery",
    });
  });
});
