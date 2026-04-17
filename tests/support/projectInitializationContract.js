import { expect } from "vitest";
import { createMainProjectionState } from "../../src/deps/services/shared/projectRepositoryViews/shared.js";

export const expectInitializedProjectStorageContract = ({
  projectId,
  creatorVersion,
  templateState,
  expectedProjectInfo,
  draftEvents = [],
  committedEvents = [],
  checkpoint,
  storedCreatorVersion,
  storedProjectInfo,
  expectedHistoryStats,
}) => {
  expect(committedEvents).toEqual([]);

  expect(draftEvents).toEqual([
    expect.objectContaining({
      projectId,
      type: "project.create",
      payload: {
        state: structuredClone(templateState),
      },
    }),
  ]);

  expect(checkpoint).toEqual(
    expect.objectContaining({
      viewVersion: "1",
      lastCommittedId: 1,
      value: createMainProjectionState(templateState),
    }),
  );

  if (expectedHistoryStats) {
    expect(checkpoint?.meta?.historyStats).toEqual(expectedHistoryStats);
  }

  expect(storedCreatorVersion).toBe(creatorVersion);
  expect(storedProjectInfo).toMatchObject(expectedProjectInfo);
};
