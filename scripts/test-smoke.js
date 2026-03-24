import assert from "node:assert/strict";

import { createCommandEnvelope } from "../src/deps/services/shared/collab/commandEnvelope.js";
import {
  mainScenePartitionFor,
  scenePartitionFor,
} from "../src/deps/services/shared/collab/partitions.js";
import {
  applyCommandToRepository,
  applyCommandToRepositoryState,
  createProjectRepository,
} from "../src/deps/services/shared/projectRepository.js";
import {
  buildLayoutRenderElements,
  extractFileIdsFromRenderState,
  prepareRenderStateKeyboardForGraphics,
} from "../src/internal/project/layout.js";
import {
  buildFilteredStateForExport,
  collectUsedResourcesForExport,
  constructProjectData,
  projectRepositoryStateToDomainState,
} from "../src/internal/project/projection.js";
import {
  BUNDLE_APP_NAME,
  BUNDLE_FORMAT_VERSION,
  createBundle,
  createBundleInstructions,
} from "../src/deps/services/shared/projectExportService.js";
import { toHierarchyStructure } from "../src/internal/project/tree.js";

const projectId = "proj-smoke-001";
const actor = {
  userId: "user-1",
  clientId: "client-1",
};
const scene1MainPartition = mainScenePartitionFor("scene-1");
const scene1Partition = scenePartitionFor("scene-1");

const createRepositoryStoreStub = () => {
  const events = [];
  const checkpoints = new Map();

  return {
    async appendEvent(event) {
      events.push(structuredClone(event));
    },
    async loadMaterializedViewCheckpoint({ viewName, partition }) {
      return checkpoints.get(`${viewName}:${partition}`);
    },
    async saveMaterializedViewCheckpoint(checkpoint) {
      checkpoints.set(
        `${checkpoint.viewName}:${checkpoint.partition}`,
        structuredClone(checkpoint),
      );
    },
    async deleteMaterializedViewCheckpoint({ viewName, partition }) {
      checkpoints.delete(`${viewName}:${partition}`);
    },
    _debug: {
      getEvents() {
        return events.map((event) => structuredClone(event));
      },
    },
  };
};

const makeEnvelope = ({ type, payload, partition = "m", clientTs }) => {
  return createCommandEnvelope({
    id: `${type}-${clientTs}`,
    projectId,
    partition,
    type,
    payload,
    actor,
    clientTs,
  });
};

const stripEmptyChildren = (nodes = []) =>
  nodes.map((node) => {
    const children = stripEmptyChildren(node.children || []);
    return children.length > 0 ? { id: node.id, children } : { id: node.id };
  });

const parseBundleInstructions = (bundle) => {
  const arrayBuffer = bundle.buffer.slice(
    bundle.byteOffset,
    bundle.byteOffset + bundle.byteLength,
  );
  const dataView = new DataView(arrayBuffer);
  const version = dataView.getUint8(0);
  assert.equal(version, BUNDLE_FORMAT_VERSION);

  const indexLength = dataView.getUint32(1, false);
  const headerSize = 16;
  const indexBuffer = new Uint8Array(arrayBuffer, headerSize, indexLength);
  const index = JSON.parse(new TextDecoder().decode(indexBuffer));
  const instructionsMeta = index.instructions;
  assert.ok(instructionsMeta);

  const dataBlockOffset = headerSize + indexLength;
  const contentStart = instructionsMeta.start + dataBlockOffset;
  const contentEnd = instructionsMeta.end + dataBlockOffset + 1;
  const content = new Uint8Array(
    arrayBuffer,
    contentStart,
    contentEnd - contentStart,
  );
  return JSON.parse(new TextDecoder().decode(content));
};

const store = createRepositoryStoreStub();
const repository = await createProjectRepository({
  projectId,
  store,
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: scene1MainPartition,
    clientTs: 1000,
    type: "scene.create",
    payload: {
      sceneId: "scene-1",
      data: {
        name: "Opening",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1010,
    type: "story.update",
    payload: {
      data: {
        initialSceneId: "scene-1",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: scene1MainPartition,
    clientTs: 1020,
    type: "section.create",
    payload: {
      sceneId: "scene-1",
      sectionId: "section-1",
      data: {
        name: "Main",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: scene1Partition,
    clientTs: 1030,
    type: "line.create",
    payload: {
      sectionId: "section-1",
      lines: [
        {
          lineId: "line-1",
          data: {
            actions: {
              narration: "hello",
            },
          },
        },
        {
          lineId: "line-2",
          data: {
            actions: {
              narration: "world",
            },
          },
        },
      ],
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: scene1MainPartition,
    clientTs: 1040,
    type: "section.create",
    payload: {
      sceneId: "scene-1",
      sectionId: "section-2",
      data: {
        name: "Branch",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: scene1Partition,
    clientTs: 1077,
    type: "line.update_actions",
    payload: {
      lineId: "line-1",
      data: {
        narration: "hello",
        control: {
          resourceId: "layout-main",
          resourceType: "control",
        },
      },
      replace: false,
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1045,
    type: "file.create",
    payload: {
      fileId: "hero.png",
      data: {
        type: "image",
        mimeType: "image/png",
        size: 1024,
        sha256: "sha256-hero",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1050,
    type: "image.create",
    payload: {
      imageId: "image-hero",
      data: {
        type: "image",
        name: "Hero",
        fileId: "hero.png",
        width: 1280,
        height: 720,
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1060,
    type: "control.create",
    payload: {
      controlId: "layout-main",
      data: {
        type: "control",
        name: "Main Control",
        elements: {
          items: {},
          tree: [],
        },
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1070,
    type: "control.element.create",
    payload: {
      controlId: "layout-main",
      elementId: "sprite-root",
      data: {
        type: "sprite",
        name: "Hero Sprite",
        imageId: "image-hero",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1075,
    type: "control.update",
    payload: {
      controlId: "layout-main",
      data: {
        keyboard: {
          enter: {
            payload: {
              actions: {
                nextLine: {},
              },
            },
          },
        },
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1080,
    type: "character.create",
    payload: {
      characterId: "character-hero",
      data: {
        type: "character",
        name: "Hero",
        description: "Lead character",
        sprites: {
          tree: [
            {
              id: "default-sprites",
              children: [],
            },
          ],
          items: {
            "default-sprites": {
              id: "default-sprites",
              type: "folder",
              name: "Default Sprites",
            },
          },
        },
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1090,
    type: "character.sprite.create",
    payload: {
      characterId: "character-hero",
      spriteId: "expressions",
      data: {
        type: "folder",
        name: "Expressions",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1095,
    type: "file.create",
    payload: {
      fileId: "hero-smile.png",
      data: {
        type: "image",
        mimeType: "image/png",
        size: 2048,
        sha256: "sha256-hero-smile",
      },
    },
  }),
});

await applyCommandToRepository({
  repository,
  projectId,
  command: makeEnvelope({
    partition: "m",
    clientTs: 1100,
    type: "character.sprite.create",
    payload: {
      characterId: "character-hero",
      spriteId: "sprite-smile",
      parentId: "expressions",
      data: {
        type: "image",
        name: "Smile",
        fileId: "hero-smile.png",
      },
    },
  }),
});

const sceneOverviews = await repository.loadSceneOverviews({
  sceneIds: ["scene-1"],
});
const repositoryState = repository.getState();
const scene1Overview = sceneOverviews["scene-1"];

assert.deepEqual(scene1Overview, {
  sceneId: "scene-1",
  name: "Opening",
  position: {
    x: 0,
    y: 0,
  },
  outgoingSceneIds: [],
  sections: [
    {
      sectionId: "section-1",
      name: "Main",
      outgoingSceneIds: [],
      isDeadEnd: true,
    },
    {
      sectionId: "section-2",
      name: "Branch",
      outgoingSceneIds: [],
      isDeadEnd: true,
    },
  ],
});

assert.equal(repositoryState.story.initialSceneId, "scene-1");
assert.deepEqual(stripEmptyChildren(repositoryState.scenes.tree), [
  { id: "scene-1" },
]);
assert.deepEqual(
  stripEmptyChildren(repositoryState.scenes.items["scene-1"].sections.tree),
  [{ id: "section-1" }, { id: "section-2" }],
);
assert.deepEqual(
  stripEmptyChildren(
    repositoryState.scenes.items["scene-1"].sections.items["section-1"].lines
      .tree,
  ),
  [{ id: "line-1" }, { id: "line-2" }],
);

const beforeInvalidApply = structuredClone(repositoryState);
const invalidLineInsert = applyCommandToRepositoryState({
  repositoryState,
  projectId,
  command: {
    type: "line.create",
    payload: {
      sectionId: "section-2",
      position: "after",
      positionTargetId: "line-1",
      lines: [
        {
          lineId: "line-3",
          data: {
            actions: {},
          },
        },
      ],
    },
  },
});

assert.equal(invalidLineInsert.valid, false);
assert.equal(
  invalidLineInsert.error.message,
  "payload.positionTargetId must reference a line in the target section",
);
assert.deepEqual(repository.getState(), beforeInvalidApply);
assert.deepEqual(repositoryState.controls.items["layout-main"].keyboard, {
  enter: {
    payload: {
      actions: {
        nextLine: {},
      },
    },
  },
});

const layoutHierarchy = toHierarchyStructure(
  repositoryState.controls.items["layout-main"].elements,
);
assert.deepEqual(
  layoutHierarchy.map((node) => node.id),
  ["sprite-root"],
);

const spriteHierarchy = toHierarchyStructure(
  repositoryState.characters.items["character-hero"].sprites,
);
assert.deepEqual(
  spriteHierarchy.map((node) => ({
    id: node.id,
    children: (node.children ?? []).map((child) => child.id),
  })),
  [
    {
      id: "default-sprites",
      children: [],
    },
    {
      id: "expressions",
      children: ["sprite-smile"],
    },
  ],
);

const renderState = buildLayoutRenderElements(
  layoutHierarchy,
  repositoryState.images.items,
  repositoryState.textStyles,
  repositoryState.colors,
  repositoryState.fonts,
);
const renderFileIds = extractFileIdsFromRenderState(renderState);
assert.deepEqual(renderFileIds, [
  {
    type: "image/png",
    url: "hero.png",
  },
]);

const domainState = projectRepositoryStateToDomainState({
  repositoryState,
  projectId,
});
const exportUsage = collectUsedResourcesForExport(repositoryState);
const filteredExportState = buildFilteredStateForExport(
  repositoryState,
  exportUsage,
);
const projectData = constructProjectData(repositoryState, {
  initialSceneId: "scene-1",
});
const exportProjectData = constructProjectData(filteredExportState);
const bundlePayload = createBundleInstructions({
  projectData: exportProjectData,
  bundler: {
    appVersion: "1.0.0-rc2",
  },
});
const bundle = await createBundle(bundlePayload);
const bundleInstructions = parseBundleInstructions(bundle);
assert.equal(domainState.story.initialSceneId, "scene-1");
assert.deepEqual(domainState.scenes["scene-1"].sectionIds, [
  "section-1",
  "section-2",
]);
assert.deepEqual(domainState.sections["section-1"].lineIds, [
  "line-1",
  "line-2",
]);
assert.equal(
  domainState.characters.items["character-hero"].sprites.items["sprite-smile"]
    .fileId,
  "hero-smile.png",
);
assert.deepEqual(domainState.controls.items["layout-main"].keyboard, {
  enter: {
    payload: {
      actions: {
        nextLine: {},
      },
    },
  },
});
assert.equal(projectData.resources.controls["layout-main"].id, "layout-main");
assert.equal(
  projectData.resources.controls["layout-main"].name,
  "Main Control",
);
assert.equal(exportProjectData.story.initialSceneId, "scene-1");
assert.equal(
  exportProjectData.story.scenes["scene-1"].initialSectionId,
  "section-1",
);
assert.deepEqual(
  exportProjectData.story.scenes["scene-1"].sections["section-1"].lines.map(
    (line) => line.id,
  ),
  ["line-1", "line-2"],
);
assert.equal(bundleInstructions.projectData.story.initialSceneId, "scene-1");
assert.equal(
  bundleInstructions.projectData.story.scenes["scene-1"].initialSectionId,
  "section-1",
);
assert.equal(
  bundleInstructions.bundleMetadata.bundler.appName,
  BUNDLE_APP_NAME,
);
assert.equal(bundleInstructions.bundleMetadata.bundler.appVersion, "1.0.0-rc2");
assert.deepEqual(
  bundleInstructions.projectData.story.scenes["scene-1"].sections[
    "section-1"
  ].lines.map((line) => line.id),
  ["line-1", "line-2"],
);
assert.deepEqual(projectData.resources.controls["layout-main"].keyboard, {
  enter: {
    actions: {
      nextLine: {},
    },
  },
});
assert.deepEqual(
  projectData.story.scenes["scene-1"].sections["section-1"].lines[0].actions
    .control,
  {
    resourceId: "layout-main",
    resourceType: "control",
  },
);

const graphicsKeyboardRenderState = prepareRenderStateKeyboardForGraphics({
  renderState: {
    elements: [],
    animations: [],
    audio: [],
    global: {
      keyboard: {
        enter: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
      },
    },
  },
});

assert.deepEqual(graphicsKeyboardRenderState.global.keyboard, {
  enter: {
    payload: {
      actions: {
        nextLine: {},
      },
    },
  },
});

const extraKeyboardRenderState = prepareRenderStateKeyboardForGraphics({
  renderState: {
    elements: [],
    animations: [],
    audio: [],
    global: {
      keyboard: {
        enter: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
        esc: {
          payload: {
            actions: {
              toggleDialogueUI: {},
            },
          },
        },
        space: {
          payload: {
            actions: {
              toggleAutoMode: {},
            },
          },
        },
      },
    },
  },
});

assert.deepEqual(extraKeyboardRenderState.global.keyboard, {
  enter: {
    payload: {
      actions: {
        nextLine: {},
      },
    },
  },
  escape: {
    payload: {
      actions: {
        toggleDialogueUI: {},
      },
    },
  },
  space: {
    payload: {
      actions: {
        toggleAutoMode: {},
      },
    },
  },
});

const disabledKeyboardRenderState = prepareRenderStateKeyboardForGraphics({
  renderState: {
    elements: [],
    animations: [],
    audio: [],
    global: {
      keyboard: {
        enter: {
          payload: {
            actions: {
              nextLine: {},
            },
          },
        },
      },
    },
  },
  enableGlobalKeyboardBindings: false,
});

assert.equal(disabledKeyboardRenderState.global.keyboard, undefined);

assert.equal(store._debug.getEvents().length, 15);

console.log("Smoke tests: PASS");
