import { describe, expect, it } from "vitest";
import { COMMAND_TYPES } from "../../src/internal/project/commands.js";
import {
  applyCommandsToRepositoryState,
  assertSupportedProjectState,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";

const createCommand = (overrides = {}) => ({
  id: "command-1",
  projectId: "project-1",
  partition: "project-1:resources:animations",
  type: COMMAND_TYPES.ANIMATION_CREATE,
  payload: {
    animationId: "fade",
    data: {
      type: "animation",
      name: "Fade",
      description: "",
      animation: {
        type: "transition",
      },
    },
  },
  actor: {
    userId: "user-1",
    clientId: "client-1",
  },
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
      mimeType: "image/webp",
      size: 1,
      sha256: "file-thumb-sha256",
    },
  },
  actor: {
    userId: "user-1",
    clientId: "client-1",
  },
  clientTs: 1,
  schemaVersion: 1,
  ...overrides,
});

describe("animation preview metadata", () => {
  it("keeps thumbnail and transform-ready preview data in repository state", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        createCommand(),
        createFileCommand(),
        createCommand({
          id: "command-2",
          type: COMMAND_TYPES.ANIMATION_UPDATE,
          payload: {
            animationId: "fade",
            data: {
              thumbnailFileId: "file-thumb",
              preview: {
                background: {
                  imageId: "image-bg",
                },
                outgoing: {
                  imageId: "image-out",
                  transformId: "transform-out",
                },
                incoming: {
                  imageId: "image-in",
                  transformId: "transform-in",
                },
              },
            },
          },
        }),
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.repositoryState.animations.items.fade).toMatchObject({
      thumbnailFileId: "file-thumb",
      preview: {
        background: {
          imageId: "image-bg",
        },
        outgoing: {
          imageId: "image-out",
          transformId: "transform-out",
        },
        incoming: {
          imageId: "image-in",
          transformId: "transform-in",
        },
      },
    });

    expect(() =>
      assertSupportedProjectState(result.repositoryState),
    ).not.toThrow();
  });

  it("does not hide invalid empty animation updates", () => {
    const result = applyCommandsToRepositoryState({
      repositoryState: structuredClone(initialProjectData),
      projectId: "project-1",
      commands: [
        createCommand(),
        createCommand({
          id: "command-2",
          type: COMMAND_TYPES.ANIMATION_UPDATE,
          payload: {
            animationId: "fade",
            data: {},
          },
        }),
      ],
    });

    expect(result.valid).toBe(false);
  });
});
