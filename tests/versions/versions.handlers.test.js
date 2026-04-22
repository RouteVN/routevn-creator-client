import { describe, expect, it, vi } from "vitest";
import {
  handleDownloadZipClick,
  handleVersionFormAction,
} from "../../src/pages/versions/versions.handlers.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";

const createTreeCollection = (items = {}, tree = []) => ({
  items,
  tree,
});

const createDeps = ({ repository, version, editingVersionId } = {}) => {
  const selectedVersion = version || {
    id: "version-1",
    name: "Version 1",
    actionIndex: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  return {
    appService: {
      getPayload: vi.fn(() => ({ p: "project-1" })),
      getCurrentProjectEntry: vi.fn(() => ({
        id: "project-1",
        name: "Project One",
      })),
      getAppVersion: vi.fn(() => "1.0.0"),
      showAlert: vi.fn(),
      closeAll: vi.fn(),
    },
    projectService: {
      ensureRepository: vi.fn(async () => repository),
      getRepository: vi.fn(async () => repository),
      getRepositoryRevision: vi.fn(() => repository?.getRevision?.()),
      loadRepositoryState: vi.fn(async (actionIndex) =>
        repository?.loadState?.(actionIndex),
      ),
      addVersionToProject: vi.fn(async () => {}),
      getCurrentProjectInfo: vi.fn(async () => ({
        namespace: "project-one",
      })),
      promptDistributionZipPath: vi.fn(async () => undefined),
      createDistributionZipStreamedToPath: vi.fn(async () => "/tmp/export.zip"),
      createDistributionZipStreamed: vi.fn(async () => "/tmp/export.zip"),
    },
    store: {
      selectEditingVersionId: vi.fn(() => editingVersionId),
      selectVersion: vi.fn((versionId) =>
        versionId === selectedVersion.id ? selectedVersion : undefined,
      ),
      addVersion: vi.fn(),
      updateVersion: vi.fn(),
      setSelectedItemId: vi.fn(),
      closeVersionDialog: vi.fn(),
      closeDropdownMenu: vi.fn(),
    },
    render: vi.fn(),
  };
};

describe("versions.handleVersionFormAction", () => {
  it("uses repository revision to create a version without loading full history", async () => {
    const repository = {
      getRevision: vi.fn(() => 7),
      loadEvents: vi.fn(async () => []),
      getEvents: vi.fn(() => []),
    };
    const deps = createDeps({
      repository,
    });

    await handleVersionFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            name: "Checkpoint 7",
            description: "notes",
          },
        },
      },
    });

    expect(deps.projectService.ensureRepository).toHaveBeenCalledTimes(1);
    expect(deps.projectService.getRepositoryRevision).toHaveBeenCalledTimes(1);
    expect(repository.loadEvents).not.toHaveBeenCalled();
    expect(deps.projectService.addVersionToProject).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        name: "Checkpoint 7",
        notes: "notes",
        actionIndex: 7,
      }),
    );
    expect(deps.store.closeVersionDialog).toHaveBeenCalled();
  });
});

describe("versions.handleDownloadZipClick", () => {
  it("uses repository.loadState when available instead of forcing full history load", async () => {
    const repository = {
      loadState: vi.fn(async () => structuredClone(initialProjectData)),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => structuredClone(initialProjectData)),
    };
    const deps = createDeps({
      repository,
    });

    await handleDownloadZipClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: {
            versionId: "version-1",
          },
        },
      },
    });

    expect(deps.projectService.loadRepositoryState).toHaveBeenCalledWith(3);
    expect(repository.loadEvents).not.toHaveBeenCalled();
    expect(
      deps.projectService.createDistributionZipStreamed,
    ).toHaveBeenCalled();
  });

  it("passes file mime metadata into streamed ZIP export", async () => {
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.story = {
      initialSceneId: "scene-1",
    };
    repositoryState.files = createTreeCollection(
      {
        "file-1": {
          id: "file-1",
          mimeType: "image/png",
          size: 123,
          sha256: "hash-1",
        },
      },
      [{ id: "file-1" }],
    );
    repositoryState.images = createTreeCollection(
      {
        "image-1": {
          id: "image-1",
          type: "image",
          fileId: "file-1",
        },
      },
      [{ id: "image-1" }],
    );
    repositoryState.scenes = createTreeCollection(
      {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene 1",
          initialSectionId: "section-1",
          sections: createTreeCollection(
            {
              "section-1": {
                id: "section-1",
                type: "section",
                name: "Section 1",
                lines: createTreeCollection(
                  {
                    "line-1": {
                      id: "line-1",
                      actions: {
                        background: {
                          resourceId: "image-1",
                          resourceType: "image",
                        },
                      },
                    },
                  },
                  [{ id: "line-1" }],
                ),
              },
            },
            [{ id: "section-1" }],
          ),
        },
      },
      [{ id: "scene-1" }],
    );

    const repository = {
      loadState: vi.fn(async () => repositoryState),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => repositoryState),
    };
    const deps = createDeps({
      repository,
    });

    await handleDownloadZipClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: {
            versionId: "version-1",
          },
        },
      },
    });

    expect(deps.projectService.createDistributionZipStreamed).toHaveBeenCalled();
    expect(
      deps.projectService.createDistributionZipStreamed.mock.calls[0][1],
    ).toEqual([{ fileId: "file-1", mimeType: "image/png" }]);
  });

  it("drops invalid font mime metadata before export", async () => {
    const repositoryState = structuredClone(initialProjectData);
    repositoryState.story.initialSceneId = "scene-1";
    repositoryState.files = createTreeCollection(
      {
        "file-font-1": {
          id: "file-font-1",
          type: "font",
          mimeType: "font/sample_font",
          size: 857712,
          sha256: "font-hash-1",
        },
      },
      [{ id: "file-font-1" }],
    );
    repositoryState.fonts = createTreeCollection(
      {
        "font-1": {
          id: "font-1",
          type: "font",
          fileId: "file-font-1",
        },
      },
      [{ id: "font-1" }],
    );
    repositoryState.textStyles = createTreeCollection(
      {
        "text-style-1": {
          id: "text-style-1",
          type: "textStyle",
          fontId: "font-1",
        },
      },
      [{ id: "text-style-1" }],
    );
    repositoryState.layouts = createTreeCollection(
      {
        "layout-1": {
          id: "layout-1",
          type: "layout",
          layoutType: "normal",
          elements: createTreeCollection(
            {
              "text-1": {
                id: "text-1",
                type: "text",
                textStyleId: "text-style-1",
              },
            },
            [{ id: "text-1" }],
          ),
        },
      },
      [{ id: "layout-1" }],
    );
    repositoryState.scenes = createTreeCollection(
      {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene 1",
          initialSectionId: "section-1",
          sections: createTreeCollection(
            {
              "section-1": {
                id: "section-1",
                type: "section",
                name: "Section 1",
                lines: createTreeCollection(
                  {
                    "line-1": {
                      id: "line-1",
                      actions: {
                        dialogue: {
                          ui: {
                            resourceId: "layout-1",
                          },
                        },
                      },
                    },
                  },
                  [{ id: "line-1" }],
                ),
              },
            },
            [{ id: "section-1" }],
          ),
        },
      },
      [{ id: "scene-1" }],
    );

    const repository = {
      loadState: vi.fn(async () => repositoryState),
      loadEvents: vi.fn(async () => []),
      getState: vi.fn(() => repositoryState),
    };
    const deps = createDeps({
      repository,
    });

    await handleDownloadZipClick(deps, {
      _event: {
        stopPropagation: vi.fn(),
        currentTarget: {
          dataset: {
            versionId: "version-1",
          },
        },
      },
    });

    expect(deps.projectService.createDistributionZipStreamed).toHaveBeenCalled();
    expect(
      deps.projectService.createDistributionZipStreamed.mock.calls[0][1],
    ).toEqual([{ fileId: "file-font-1" }]);
  });
});
