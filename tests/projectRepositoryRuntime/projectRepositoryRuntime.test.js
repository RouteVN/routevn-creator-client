import { describe, expect, it } from "vitest";
import { replayEventsToRepositoryState } from "../../src/deps/services/shared/projectRepositoryRuntime.js";

describe("projectRepositoryRuntime replay diagnostics", () => {
  it("attaches failing event details when historical replay throws", () => {
    const events = [
      {
        id: "event-1",
        type: "scene.create",
        partition: "m",
        payload: {
          sceneId: "scene-1",
        },
      },
      {
        id: "event-2",
        type: "line.create",
        partition: "s:scene-1",
        payload: {
          sectionId: "missing-section",
        },
      },
    ];

    let error;

    try {
      replayEventsToRepositoryState({
        events,
        untilEventIndex: events.length,
        createInitialState: () => ({
          appliedEventIds: [],
        }),
        reduceEventToState: ({ repositoryState, event }) => {
          if (event.id === "event-2") {
            const replayFailure = new Error(
              "payload.sectionId must reference an existing section",
            );

            replayFailure.code = "validation_failed";
            replayFailure.details = {
              sectionId: "missing-section",
            };
            throw replayFailure;
          }

          return {
            ...repositoryState,
            appliedEventIds: [...repositoryState.appliedEventIds, event.id],
          };
        },
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error?.name).toBe("ProjectRepositoryReplayError");
    expect(error?.code).toBe("validation_failed");
    expect(error?.message).toBe(
      "payload.sectionId must reference an existing section",
    );
    expect(error?.details?.sectionId).toBe("missing-section");
    expect(error?.details?.replay).toMatchObject({
      targetEventCount: 2,
      failedEventArrayIndex: 1,
      failedEventOffset: 2,
      failedEvent: {
        arrayIndex: 1,
        eventOffset: 2,
        id: "event-2",
        type: "line.create",
        partition: "s:scene-1",
        payload: {
          sectionId: "missing-section",
        },
      },
    });
    expect(error?.details?.replay?.nearbyEvents).toHaveLength(2);
    expect(error?.cause?.message).toBe(
      "payload.sectionId must reference an existing section",
    );
  });
});
