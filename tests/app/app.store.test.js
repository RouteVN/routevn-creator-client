import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setRepositoryLoading,
  setRepositoryLoadingPhase,
  setRepositoryLoadingProgress,
} from "../../src/pages/app/app.store.js";

describe("app.store repository loading progress", () => {
  it("derives a percentage-based loading message and bar width", () => {
    const state = createInitialState();

    setRepositoryLoading({ state }, { isLoading: true });
    setRepositoryLoadingPhase(
      { state },
      {
        phase: "Building project state...",
      },
    );
    setRepositoryLoadingProgress(
      { state },
      {
        current: 128,
        total: 256,
      },
    );

    expect(selectViewData({ state })).toMatchObject({
      isRepositoryLoading: true,
      hasRepositoryLoadingProgress: true,
      repositoryLoadingProgressPercent: 50,
      repositoryLoadingProgressWidth: "50%",
      repositoryLoadingStatusText: "Loading project... 50%",
    });
  });

  it("keeps a stable loading message before progress exists", () => {
    const state = createInitialState();

    setRepositoryLoading({ state }, { isLoading: true });
    setRepositoryLoadingPhase(
      { state },
      {
        phase: "Opening project database...",
      },
    );

    expect(selectViewData({ state })).toMatchObject({
      isRepositoryLoading: true,
      hasRepositoryLoadingProgress: false,
      repositoryLoadingStatusText: "Loading project...",
    });
  });

  it("clamps loading progress to the reported total", () => {
    const state = createInitialState();

    setRepositoryLoading({ state }, { isLoading: true });
    setRepositoryLoadingProgress(
      { state },
      {
        current: 600,
        total: 512,
      },
    );

    expect(state.repositoryLoadingCurrent).toBe(512);
    expect(state.repositoryLoadingTotal).toBe(512);
    expect(selectViewData({ state }).repositoryLoadingProgressPercent).toBe(
      100,
    );
  });
});
