import { describe, expect, it, vi } from "vitest";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";
import {
  buildImageUsageIndex,
  selectFolderImageIds,
  selectImageUsage,
} from "../../src/deps/services/shared/resourceUsage.js";
import { scenePartitionFor } from "../../src/deps/services/shared/collab/partitions.js";
import {
  projectRepositoryStateToDomainState,
  recursivelyCheckResource,
} from "../../src/internal/project/projection.js";

const SCENE_VIEW_VERSION = "2";

const createCollection = (items = []) => ({
  items: Object.fromEntries(items.map((item) => [item.id, item])),
  tree: items.map((item) => ({ id: item.id })),
});

const createSection = ({ id, name, lines = [] }) => ({
  id,
  type: "section",
  name,
  lines: createCollection(lines),
});

const createScene = ({ id, name, sections = [] }) => ({
  id,
  type: "scene",
  name,
  sections: createCollection(sections),
});

const createImage = (id, name) => ({
  id,
  type: "image",
  name,
  fileId: `file-${id}`,
  width: 64,
  height: 64,
});

const backgroundLine = (id, imageId) => ({
  id,
  actions: {
    background: { resourceId: imageId, resourceType: "image" },
  },
});

const dialogueLine = (id) => ({
  id,
  actions: {
    dialogue: { content: [{ text: "Hello" }] },
  },
});

// Every scene with its lines, as the project is once all scenes are loaded.
const createFullState = () => {
  const state = structuredClone(initialProjectData);
  state.images = createCollection([
    createImage("image-bg", "Classroom"),
    createImage("image-button", "Button"),
    createImage("image-mask", "Wipe mask"),
    createImage("image-flake", "Flake"),
    createImage("image-spark", "Spark"),
    createImage("image-free", "Unused"),
  ]);
  state.layouts = createCollection([
    {
      id: "layout-menu",
      type: "layout",
      name: "Main menu",
      layoutType: "general",
      elements: createCollection([
        {
          id: "element-1",
          type: "sprite",
          name: "Start",
          imageId: "image-button",
          hoverImageId: "image-button",
        },
      ]),
    },
  ]);
  state.controls = createCollection([
    {
      id: "control-skip",
      type: "control",
      name: "Skip",
      elements: createCollection([
        { id: "element-2", type: "sprite", imageId: "image-button" },
      ]),
    },
  ]);
  state.animations = createCollection([
    {
      id: "animation-wipe",
      type: "animation",
      name: "Wipe left",
      animation: {
        type: "transition",
        mask: {
          kind: "single",
          imageId: "image-mask",
          channel: "red",
          softness: 0.1,
          progressDuration: 900,
          progressEasing: "linear",
        },
      },
    },
  ]);
  state.particles = createCollection([
    {
      id: "particle-snow",
      type: "particle",
      name: "Snowfall",
      width: 1920,
      height: 1080,
      modules: { appearance: { texture: "image-flake" } },
    },
    {
      id: "particle-sparks",
      type: "particle",
      name: "Sparks",
      width: 1920,
      height: 1080,
      modules: { appearance: { texture: "image-spark" } },
    },
  ]);
  state.scenes = createCollection([
    createScene({
      id: "scene-opening",
      name: "Opening",
      sections: [
        createSection({
          id: "section-1",
          name: "Section 1",
          lines: [
            backgroundLine("line-1", "image-bg"),
            dialogueLine("line-2"),
            backgroundLine("line-3", "image-bg"),
          ],
        }),
        createSection({
          id: "section-2",
          name: "Section 2",
          lines: [
            {
              id: "line-4",
              actions: {
                visual: {
                  items: [
                    {
                      id: "visual-1",
                      resourceId: "particle-snow",
                      resourceType: "particle",
                    },
                  ],
                },
              },
            },
          ],
        }),
      ],
    }),
    createScene({
      id: "scene-rooftop",
      name: "School rooftop",
      sections: [
        createSection({
          id: "section-3",
          name: "Section 1",
          lines: [
            dialogueLine("line-5"),
            {
              id: "line-6",
              actions: {
                visual: {
                  items: [
                    {
                      id: "visual-2",
                      resourceId: "image-button",
                      resourceType: "image",
                    },
                  ],
                },
              },
            },
          ],
        }),
      ],
    }),
    createScene({
      id: "scene-ending",
      name: "Ending",
      sections: [
        createSection({
          id: "section-4",
          name: "Section 1",
          lines: [backgroundLine("line-7", "image-bg")],
        }),
      ],
    }),
  ]);

  return state;
};

const stripLines = (state, keepSceneId) => {
  const stripped = structuredClone(state);
  for (const scene of Object.values(stripped.scenes.items)) {
    if (scene.id === keepSceneId) {
      continue;
    }
    for (const section of Object.values(scene.sections.items)) {
      section.lines = { items: {}, tree: [] };
    }
  }
  return stripped;
};

// The repository as the Images page finds it: "School rooftop" is the open
// scene, "Opening" has a stored snapshot, and "Ending" has none.
const createRepositoryFixture = () => {
  const fullState = createFullState();
  const repositoryState = stripLines(fullState, "scene-rooftop");
  const repository = {
    getState: () => structuredClone(repositoryState),
    getContextState: vi.fn(async ({ sceneIds }) => {
      const state = structuredClone(repositoryState);
      for (const sceneId of sceneIds) {
        state.scenes.items[sceneId] = structuredClone(
          fullState.scenes.items[sceneId],
        );
      }
      return state;
    }),
  };
  const store = {
    loadMaterializedViewCheckpoints: vi.fn(async ({ partitions }) =>
      partitions
        .filter((partition) => partition === scenePartitionFor("scene-opening"))
        .map((partition) => ({
          partition,
          viewVersion: SCENE_VIEW_VERSION,
          value: {
            scenes: {
              items: {
                "scene-opening": structuredClone(
                  fullState.scenes.items["scene-opening"],
                ),
              },
            },
          },
        })),
    ),
  };

  return { fullState, repository, store };
};

describe("buildImageUsageIndex", () => {
  it("lists the lines of every scene that uses an image", async () => {
    const { repository, store } = createRepositoryFixture();

    const index = await buildImageUsageIndex({ repository, store });

    expect(selectImageUsage({ index, imageId: "image-bg" })).toEqual({
      blocksDelete: true,
      usages: [
        {
          type: "scene",
          id: "scene-opening",
          name: "Opening",
          lines: [
            {
              sectionId: "section-1",
              sectionName: "Section 1",
              lineId: "line-1",
              lineNumber: 1,
              actionTypes: ["background"],
            },
            {
              sectionId: "section-1",
              sectionName: "Section 1",
              lineId: "line-3",
              lineNumber: 3,
              actionTypes: ["background"],
            },
          ],
        },
        {
          type: "scene",
          id: "scene-ending",
          name: "Ending",
          lines: [
            {
              sectionId: "section-4",
              sectionName: "Section 1",
              lineId: "line-7",
              lineNumber: 1,
              actionTypes: ["background"],
            },
          ],
        },
      ],
    });
  });

  it("reads the open scene from the repository, stored snapshots in one query, and the rest through the repository", async () => {
    const { repository, store } = createRepositoryFixture();

    await buildImageUsageIndex({ repository, store });

    expect(store.loadMaterializedViewCheckpoints).toHaveBeenCalledTimes(1);
    expect(store.loadMaterializedViewCheckpoints).toHaveBeenCalledWith({
      viewName: "project_repository_scene_state",
      partitions: [
        scenePartitionFor("scene-opening"),
        scenePartitionFor("scene-ending"),
      ],
    });
    expect(repository.getContextState).toHaveBeenCalledTimes(1);
    expect(repository.getContextState).toHaveBeenCalledWith({
      sceneIds: ["scene-ending"],
    });
  });

  it("lists scenes, layouts and controls, in that order", async () => {
    const { repository, store } = createRepositoryFixture();

    const index = await buildImageUsageIndex({ repository, store });

    expect(selectImageUsage({ index, imageId: "image-button" })).toEqual({
      blocksDelete: true,
      usages: [
        {
          type: "scene",
          id: "scene-rooftop",
          name: "School rooftop",
          lines: [
            {
              sectionId: "section-3",
              sectionName: "Section 1",
              lineId: "line-6",
              lineNumber: 2,
              actionTypes: ["visual"],
            },
          ],
        },
        { type: "layout", id: "layout-menu", name: "Main menu" },
        { type: "control", id: "control-skip", name: "Skip" },
      ],
    });
  });

  it("lists an animation that uses the image as a transition mask", async () => {
    const { repository, store } = createRepositoryFixture();

    const index = await buildImageUsageIndex({ repository, store });

    expect(selectImageUsage({ index, imageId: "image-mask" })).toEqual({
      blocksDelete: true,
      usages: [{ type: "animation", id: "animation-wipe", name: "Wipe left" }],
    });
  });

  it("lets an image be deleted when only a particle nothing shows uses it", async () => {
    const { repository, store } = createRepositoryFixture();

    const index = await buildImageUsageIndex({ repository, store });

    expect(selectImageUsage({ index, imageId: "image-flake" })).toEqual({
      blocksDelete: true,
      usages: [
        {
          type: "particle",
          id: "particle-snow",
          name: "Snowfall",
          isShown: true,
        },
      ],
    });
    expect(selectImageUsage({ index, imageId: "image-spark" })).toEqual({
      blocksDelete: false,
      usages: [
        {
          type: "particle",
          id: "particle-sparks",
          name: "Sparks",
          isShown: false,
        },
      ],
    });
  });

  it("lists a line once when two of its actions use the image", async () => {
    const { fullState, repository, store } = createRepositoryFixture();
    const line =
      fullState.scenes.items["scene-rooftop"].sections.items["section-3"].lines
        .items["line-6"];
    line.actions.background = {
      resourceId: "image-button",
      resourceType: "image",
    };
    repository.getState = () => structuredClone(fullState);

    const index = await buildImageUsageIndex({ repository, store });

    expect(
      selectImageUsage({ index, imageId: "image-button" }).usages[0].lines,
    ).toEqual([
      {
        sectionId: "section-3",
        sectionName: "Section 1",
        lineId: "line-6",
        lineNumber: 2,
        actionTypes: ["visual", "background"],
      },
    ]);
  });

  it("keeps the images the index was built from", async () => {
    const { repository, store } = createRepositoryFixture();

    const index = await buildImageUsageIndex({ repository, store });

    expect(index.images.items["image-bg"]).toMatchObject({
      name: "Classroom",
      fileId: "file-image-bg",
    });
    expect(index.images.tree).toHaveLength(6);
  });

  it("loads the scenes that have no stored snapshot in batches", async () => {
    const state = structuredClone(initialProjectData);
    state.images = createCollection([createImage("image-bg", "Classroom")]);
    const fullScenes = Array.from({ length: 45 }, (_, sceneIndex) =>
      createScene({
        id: `scene-${sceneIndex}`,
        name: `Scene ${sceneIndex}`,
        sections: [
          createSection({
            id: `section-${sceneIndex}`,
            name: "Section 1",
            lines: [backgroundLine(`line-${sceneIndex}`, "image-bg")],
          }),
        ],
      }),
    );
    const fullState = structuredClone(state);
    fullState.scenes = createCollection(fullScenes);
    const repositoryState = stripLines(fullState);
    const repository = {
      getState: () => structuredClone(repositoryState),
      getContextState: vi.fn(async ({ sceneIds }) => {
        const loadedState = structuredClone(repositoryState);
        for (const sceneId of sceneIds) {
          loadedState.scenes.items[sceneId] = structuredClone(
            fullState.scenes.items[sceneId],
          );
        }
        return loadedState;
      }),
    };
    const store = { loadMaterializedViewCheckpoints: vi.fn(async () => []) };

    const index = await buildImageUsageIndex({ repository, store });

    expect(
      repository.getContextState.mock.calls.map(
        ([{ sceneIds }]) => sceneIds.length,
      ),
    ).toEqual([20, 20, 5]);
    expect(
      selectImageUsage({ index, imageId: "image-bg" }).usages.map(
        (usage) => usage.id,
      ),
    ).toEqual(fullScenes.map((scene) => scene.id));
  });

  it("finds no usage for an image nothing uses", async () => {
    const { repository, store } = createRepositoryFixture();

    const index = await buildImageUsageIndex({ repository, store });

    expect(selectImageUsage({ index, imageId: "image-free" })).toEqual({
      blocksDelete: false,
      usages: [],
    });
  });

  it("ignores a stored snapshot of another view version", async () => {
    const { repository, store } = createRepositoryFixture();
    store.loadMaterializedViewCheckpoints.mockImplementation(
      async ({ partitions }) =>
        partitions.map((partition) => ({
          partition,
          viewVersion: "1",
          value: { scenes: { items: {} } },
        })),
    );

    const index = await buildImageUsageIndex({ repository, store });

    expect(repository.getContextState).toHaveBeenCalledWith({
      sceneIds: ["scene-opening", "scene-ending"],
    });
    expect(
      selectImageUsage({ index, imageId: "image-bg" }).usages.map(
        (usage) => usage.id,
      ),
    ).toEqual(["scene-opening", "scene-ending"]);
  });

  it("returns usages that can be changed without changing the index", async () => {
    const { repository, store } = createRepositoryFixture();
    const index = await buildImageUsageIndex({ repository, store });

    selectImageUsage({ index, imageId: "image-bg" }).usages[0].lines.length = 0;

    expect(
      selectImageUsage({ index, imageId: "image-bg" }).usages[0].lines,
    ).toHaveLength(2);
  });

  // The Images page decides whether an image can be deleted from this index,
  // so it has to agree with the check the other resource pages delete with.
  it("blocks a delete exactly when recursivelyCheckResource finds the image in use", async () => {
    const { fullState, repository, store } = createRepositoryFixture();
    const index = await buildImageUsageIndex({ repository, store });
    const domainState = projectRepositoryStateToDomainState({
      repositoryState: fullState,
      projectId: "project-1",
    });

    const imageIds = Object.keys(fullState.images.items);
    const expected = Object.fromEntries(
      imageIds.map((imageId) => [
        imageId,
        recursivelyCheckResource({
          state: domainState,
          itemId: imageId,
          checkTargets: ["scenes", "layouts", "controls", "animations"],
        }).isUsed,
      ]),
    );
    const actual = Object.fromEntries(
      imageIds.map((imageId) => [
        imageId,
        selectImageUsage({ index, imageId }).blocksDelete,
      ]),
    );

    expect(actual).toEqual(expected);
    expect(expected).toEqual({
      "image-bg": true,
      "image-button": true,
      "image-mask": true,
      "image-flake": true,
      "image-spark": false,
      "image-free": false,
    });
  });
});

describe("selectFolderImageIds", () => {
  const images = {
    items: {
      "folder-1": { id: "folder-1", type: "folder", name: "Folder One" },
      "image-1": { id: "image-1", type: "image", name: "Image One" },
      "folder-2": { id: "folder-2", type: "folder", name: "Folder Two" },
      "image-2": { id: "image-2", type: "image", name: "Image Two" },
      "image-3": { id: "image-3", type: "image", name: "Image Three" },
      "folder-3": { id: "folder-3", type: "folder", name: "Folder Three" },
      "image-4": { id: "image-4", type: "image", name: "Image Four" },
    },
    tree: [
      {
        id: "folder-1",
        children: [
          { id: "image-1" },
          { id: "folder-2", children: [{ id: "image-2" }] },
          { id: "image-3" },
        ],
      },
      { id: "folder-3" },
      { id: "image-4" },
    ],
  };

  it("lists the images in a folder and in the folders inside it, in tree order", () => {
    expect(selectFolderImageIds({ images, folderId: "folder-1" })).toEqual([
      "image-1",
      "image-2",
      "image-3",
    ]);
  });

  it("lists the images of a folder inside another folder", () => {
    expect(selectFolderImageIds({ images, folderId: "folder-2" })).toEqual([
      "image-2",
    ]);
  });

  it("lists nothing for an empty folder or a folder that is not there", () => {
    expect(selectFolderImageIds({ images, folderId: "folder-3" })).toEqual([]);
    expect(selectFolderImageIds({ images, folderId: "folder-9" })).toEqual([]);
  });
});
