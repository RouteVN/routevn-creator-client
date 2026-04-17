import { describe, expect, it, vi } from "vitest";
import {
  createProjectRepositoryRuntime,
  replayEventsToRepositoryState,
} from "../../src/deps/services/shared/projectRepositoryRuntime.js";

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

  it("attaches failing event details when batched historical replay throws", () => {
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
        reduceEventToState: () => {
          throw new Error("reduceEventToState should not be used");
        },
        reduceEventsToState: () => {
          const replayFailure = new Error(
            "payload.sectionId must reference an existing section",
          );

          replayFailure.code = "validation_failed";
          replayFailure.details = {
            sectionId: "missing-section",
            commandIndex: 1,
          };
          throw replayFailure;
        },
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(Error);
    expect(error?.name).toBe("ProjectRepositoryReplayError");
    expect(error?.code).toBe("validation_failed");
    expect(error?.details?.sectionId).toBe("missing-section");
    expect(error?.details?.commandIndex).toBe(1);
    expect(error?.details?.replay).toMatchObject({
      targetEventCount: 2,
      failedEventArrayIndex: 1,
      failedEventOffset: 2,
      failedEvent: {
        id: "event-2",
        type: "line.create",
        partition: "s:scene-1",
      },
    });
  });

  it("reports initial main hydration progress while replaying checkpoint gaps", async () => {
    const events = Array.from({ length: 300 }, (_, index) => ({
      id: `event-${index + 1}`,
      type: "resource.update",
      partition: "m",
      payload: {
        index,
      },
    }));
    const progressUpdates = [];

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        loadMaterializedViewCheckpoint: async () => ({
          viewName: "project_repository_main_state",
          viewVersion: "1",
          partition: "m",
          lastCommittedId: 0,
          value: {
            appliedCount: 0,
          },
        }),
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      events,
      createInitialState: () => ({
        appliedCount: 0,
      }),
      reduceEventToState: ({ repositoryState, event }) => ({
        appliedCount:
          Number(repositoryState?.appliedCount || 0) +
          (Number.isFinite(event?.payload?.index) ? 1 : 0),
      }),
      onHydrationProgress: (progress) => {
        progressUpdates.push(progress);
      },
    });

    expect(repository.getState()).toEqual({
      appliedCount: 300,
    });
    expect(progressUpdates[0]).toEqual({
      current: 0,
      total: 300,
    });
    expect(progressUpdates).toContainEqual({
      current: 256,
      total: 300,
    });
    expect(progressUpdates.at(-1)).toEqual({
      current: 300,
      total: 300,
    });
  });

  it("boots from a current main checkpoint without loading full history", async () => {
    const loadEvents = vi.fn(async () => [
      {
        id: "event-1",
        type: "resource.update",
        partition: "m",
        payload: {
          index: 1,
        },
      },
    ]);

    const repository = await createProjectRepositoryRuntime({
      projectId: "project-1",
      store: {
        loadMaterializedViewCheckpoint: async () => ({
          viewName: "project_repository_main_state",
          viewVersion: "1",
          partition: "m",
          lastCommittedId: 1,
          value: {
            appliedCount: 1,
          },
        }),
        saveMaterializedViewCheckpoint: async () => {},
        deleteMaterializedViewCheckpoint: async () => {},
      },
      initialRevision: 1,
      loadEvents,
      createInitialState: () => ({
        appliedCount: 0,
      }),
      reduceEventToState: ({ repositoryState, event }) => ({
        appliedCount:
          Number(repositoryState?.appliedCount || 0) +
          (Number.isFinite(event?.payload?.index) ? 1 : 0),
      }),
    });

    expect(repository.getState()).toEqual({
      appliedCount: 1,
    });
    expect(loadEvents).not.toHaveBeenCalled();

    const events = await repository.loadEvents();

    expect(loadEvents).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(repository.getEvents()).toHaveLength(1);
    expect(repository.getState(1)).toEqual({
      appliedCount: 1,
    });
  });
});
