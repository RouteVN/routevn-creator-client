import { expect } from "vitest";
import { createMainProjectionState } from "../../src/deps/services/shared/projectRepositoryViews/shared.js";

export const expectInitializedProjectStorageContract = ({
  projectId,
  creatorVersion,
  templateState,
  expectedProjectInfo,
  draftEvents = [],
  committedEvents = [],
  bootstrapEventLocation = "draft",
  checkpoint,
  storedCreatorVersion,
  storedProjectInfo,
  expectedHistoryStats,
}) => {
  const bootstrapEventExpectation = expect.objectContaining({
    projectId,
    type: "project.create",
    payload: {
      state: structuredClone(templateState),
    },
  });

  if (bootstrapEventLocation === "committed") {
    expect(draftEvents).toEqual([]);
    expect(committedEvents).toEqual([bootstrapEventExpectation]);
    expect(Number(committedEvents[0]?.committedId)).toBe(1);
    expect(Number(committedEvents[0]?.clientTs)).toBeGreaterThan(0);
    expect(Number(committedEvents[0]?.serverTs)).toBeGreaterThan(0);
  } else {
    expect(committedEvents).toEqual([]);
    expect(draftEvents).toEqual([bootstrapEventExpectation]);
    expect(Number(draftEvents[0]?.clientTs)).toBeGreaterThan(0);
    expect(Number(draftEvents[0]?.createdAt)).toBeGreaterThan(0);
  }

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
