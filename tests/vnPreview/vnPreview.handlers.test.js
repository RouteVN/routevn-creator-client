import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructProjectDataMock = vi.fn();
const extractInitialHybridSceneIdsMock = vi.fn(() => []);
const withPreviewEntryPointMock = vi.fn((projectData) => projectData);
const ensurePreviewProjectDataTargetsMock = vi.fn(
  async ({ projectData, loadedSceneIds }) => ({
    didLoad: false,
    projectData,
    loadedSceneIds,
  }),
);

vi.mock("../../src/internal/project/projection.js", () => ({
  constructProjectData: constructProjectDataMock,
}));

vi.mock("../../src/internal/project/layout.js", () => ({
  extractFileIdsForLayouts: vi.fn(() => []),
  extractSceneIdsFromValue: vi.fn(() => []),
  extractFileIdsForScenes: vi.fn(() => []),
  extractInitialHybridSceneIds: extractInitialHybridSceneIdsMock,
  extractLayoutIdsFromValue: vi.fn(() => []),
  resolveEventBindings: vi.fn(() => ({})),
  extractTransitionTargetSceneIds: vi.fn(() => []),
  extractTransitionTargetSceneIdsFromActions: vi.fn(() => []),
}));

vi.mock("../../src/internal/runtime/graphicsEngineRuntime.js", () => ({
  prepareRuntimeInteractionExecution: vi.fn(async ({ actions }) => ({
    eventData: {},
    preparedActions: actions,
    resolvedActions: actions,
  })),
}));

vi.mock("../../src/components/vnPreview/support/vnPreviewProjectData.js", () => ({
  collectPreviewMissingTargets: vi.fn(() => ({
    missingSceneIds: [],
    missingSectionIds: [],
  })),
  collectSceneIdsFromValue: vi.fn(() => []),
  collectSectionIdsFromValue: vi.fn(() => []),
  ensurePreviewProjectDataTargets: ensurePreviewProjectDataTargetsMock,
  withPreviewEntryPoint: withPreviewEntryPointMock,
}));

describe("vnPreview.handlers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    constructProjectDataMock.mockReset();
    extractInitialHybridSceneIdsMock.mockReset();
    withPreviewEntryPointMock.mockClear();
    ensurePreviewProjectDataTargetsMock.mockClear();

    constructProjectDataMock.mockReturnValue({
      screen: {
        width: 1280,
        height: 720,
      },
      story: {
        scenes: {},
      },
    });
    extractInitialHybridSceneIdsMock.mockReturnValue([]);
  });

  it("clears the scene editor mute override when mounting full-screen preview", async () => {
    const { handleAfterMount } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );

    const deps = {
      projectService: {
        ensureRepository: vi.fn(async () => ({})),
        getRepositoryState: vi.fn(() => ({})),
      },
      graphicsService: {
        setEngineAudioMuted: vi.fn(),
        init: vi.fn(async () => {}),
        initRouteEngine: vi.fn(async () => {}),
        loadAssets: vi.fn(async () => {}),
        engineHandleActions: vi.fn(),
      },
      refs: {
        canvas: {},
      },
      props: {},
      store: {
        setProjectResolution: vi.fn(),
        setAssetLoading: vi.fn(),
        resetAssetLoadCache: vi.fn(),
        selectHasLoadedAssetFileId: vi.fn(() => false),
        selectHasLoadedAssetSceneId: vi.fn(() => false),
        markAssetFileIdsLoaded: vi.fn(),
        markAssetSceneIdsLoaded: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleAfterMount(deps);

    expect(deps.graphicsService.setEngineAudioMuted).toHaveBeenCalledWith(
      false,
    );
  });

  it("destroys the preview graphics runtime during unmount cleanup", async () => {
    const { handleBeforeMount } = await import(
      "../../src/components/vnPreview/vnPreview.handlers.js"
    );

    const removeEventListener = vi.fn();
    const addEventListener = vi.fn();
    vi.stubGlobal("window", {
      addEventListener,
      removeEventListener,
    });

    const deps = {
      dispatchEvent: vi.fn(),
      graphicsService: {
        destroy: vi.fn(),
      },
      store: {
        setAssetLoading: vi.fn(),
        resetAssetLoadCache: vi.fn(),
      },
    };

    const cleanup = handleBeforeMount(deps);
    cleanup();

    expect(addEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
    expect(deps.graphicsService.destroy).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });
});
