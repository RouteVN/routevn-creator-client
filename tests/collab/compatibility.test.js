import { describe, expect, it } from "vitest";
import {
  createCommittedCommandProjectionTracker,
  evaluateRemoteCommandCompatibility,
  REMOTE_COMMAND_COMPATIBILITY,
} from "../../src/deps/services/shared/collab/compatibility.js";

describe("evaluateRemoteCommandCompatibility", () => {
  it("rejects variable enum payloads that creator model validation rejects", () => {
    const result = evaluateRemoteCommandCompatibility({
      id: "cmd-1",
      type: "variable.create",
      schemaVersion: 1,
      payload: {
        variableId: "mood",
        data: {
          type: "string",
          name: "Mood",
          scope: "context",
          enumValues: [42],
          default: "happy",
          value: "happy",
        },
      },
    });

    expect(result.status).toBe(REMOTE_COMMAND_COMPATIBILITY.INVALID);
    expect(result.reason).toBe("validation_failed");
    expect(result.message).toContain(
      "payload.data.enumValues[0] must be a string",
    );
  });
});

describe("createCommittedCommandProjectionTracker", () => {
  it("persists a projection gap after an incompatible remote command", () => {
    const tracker = createCommittedCommandProjectionTracker();

    const incompatibleResult = tracker.resolveCommittedCommand({
      command: {
        id: "cmd-1",
        type: "scene.future_command",
        schemaVersion: 999,
      },
      committedEvent: {
        committedId: 1,
        id: "event-1",
      },
      sourceType: "remote",
      isFromCurrentActor: false,
    });

    expect(incompatibleResult.compatibility.status).toBe(
      REMOTE_COMMAND_COMPATIBILITY.FUTURE,
    );
    expect(incompatibleResult.projectionStatus).toBe("skipped_future");
    expect(incompatibleResult.projectionGap).toMatchObject({
      committedId: 1,
      eventId: "event-1",
      commandId: "cmd-1",
      sourceType: "remote",
    });

    const skippedResult = tracker.resolveCommittedCommand({
      command: {
        id: "cmd-2",
        type: "scene.create",
        schemaVersion: 1,
        payload: {
          sceneId: "scene-1",
          data: {
            name: "Scene 1",
          },
        },
      },
      committedEvent: {
        committedId: 2,
        id: "event-2",
      },
      sourceType: "remote",
      isFromCurrentActor: false,
    });

    expect(skippedResult.compatibility.status).toBe(
      REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE,
    );
    expect(skippedResult.projectionStatus).toBe("skipped_due_to_gap");
    expect(skippedResult.projectionGap).toMatchObject({
      committedId: 1,
      eventId: "event-1",
      commandId: "cmd-1",
    });
  });
});
