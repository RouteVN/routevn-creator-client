import { describe, expect, it } from "vitest";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";
import {
  applyCommandsToRepositoryState,
  assertSupportedProjectState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";

const actor = {
  userId: "user-1",
  clientId: "client-1",
};

const createCommand = (overrides = {}) => ({
  id: "command-1",
  projectId: "project-1",
  partition: "project-1:resources:transforms",
  type: COMMAND_TYPES.TRANSFORM_CREATE,
  payload: {
    transformId: "center",
    data: {
      type: "transform",
      name: "Center",
      description: "",
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      anchorX: 0,
      anchorY: 0,
      rotation: 0,
    },
  },
  actor,
  clientTs: 1,
  schemaVersion: 1,
  ...overrides,
});

const createFileCommand = (overrides = {}) => ({
  id: "file-command-1",
  projectId: "project-1",
  partition: "project-1:resources:files",
  type: COMMAND_TYPES.FILE_CREATE,
  payload: {
    fileId: "file-thumb",
    data: {
      mimeType: "image/jpeg",
      size: 1,
      sha256: "file-thumb-sha256",
    },
  },
  actor,
  clientTs: 1,
  schemaVersion: 1,
  ...overrides,
});

const createRepositoryStateWithPreviewImages = () => {
  const state = structuredClone(initialProjectData);
  for (const fileId of ["file-bg", "file-target"]) {
    state.files.items[fileId] = {
      id: fileId,
      type: "image",
      mimeType: "image/png",
      size: 1,
      sha256: `${fileId}-sha256`,
    };
    state.files.tree.push({
      id: fileId,
      children: [],
    });
  }

  state.images.items["image-bg"] = {
    id: "image-bg",
    type: "image",
    name: "Background",
    fileId: "file-bg",
  };
  state.images.items["image-target"] = {
    id: "image-target",
    type: "image",
    name: "Target",
    fileId: "file-target",
  };
  state.images.tree.push(
    {
      id: "image-bg",
      children: [],
    },
    {
      id: "image-target",
      children: [],
    },
  );

  return state;
};

describe("transform preview metadata", () => {
  it("keeps captured thumbnail and preview image ids in repository state", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: createRepositoryStateWithPreviewImages(),
      projectId: "project-1",
      commands: [
        createCommand(),
        createFileCommand(),
        createFileCommand({
          id: "file-command-2",
          payload: {
            fileId: "file-preview",
            data: {
              mimeType: "image/png",
              size: 1,
              sha256: "file-preview-sha256",
            },
          },
        }),
        createCommand({
          id: "command-2",
          type: COMMAND_TYPES.TRANSFORM_UPDATE,
          payload: {
            transformId: "center",
            data: {
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              anchorX: 0,
              anchorY: 0,
              rotation: 0,
              thumbnailFileId: "file-thumb",
              previewFileId: "file-preview",
              preview: {
                background: {
                  imageId: "image-bg",
                },
                target: {
                  imageId: "image-target",
                },
              },
            },
          },
        }),
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.repositoryState.transforms.items.center).toMatchObject({
      thumbnailFileId: "file-thumb",
      previewFileId: "file-preview",
      preview: {
        background: {
          imageId: "image-bg",
        },
        target: {
          imageId: "image-target",
        },
      },
    });
    expect(() =>
      assertSupportedProjectState(result.repositoryState),
    ).not.toThrow();
  });

  it("rejects transform thumbnails that do not reference a repository file", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        createCommand({
          payload: {
            transformId: "center",
            data: {
              type: "transform",
              name: "Center",
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              anchorX: 0,
              anchorY: 0,
              rotation: 0,
              thumbnailFileId: "missing-file",
            },
          },
        }),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "transform.thumbnailFileId must reference an existing non-folder file",
    );
  });

  it("rejects transform full preview files that do not reference a repository file", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        createCommand({
          payload: {
            transformId: "center",
            data: {
              type: "transform",
              name: "Center",
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              anchorX: 0,
              anchorY: 0,
              rotation: 0,
              previewFileId: "missing-file",
            },
          },
        }),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "transform.previewFileId must reference an existing non-folder file",
    );
  });

  it("rejects transform preview images that do not reference repository images", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        createCommand({
          payload: {
            transformId: "center",
            data: {
              type: "transform",
              name: "Center",
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              anchorX: 0,
              anchorY: 0,
              rotation: 0,
              preview: {
                background: {
                  imageId: "missing-image",
                },
              },
            },
          },
        }),
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.error.message).toBe(
      "transform.preview.background.imageId must reference an existing image",
    );
  });
});
