import assert from "node:assert/strict";
import createRouteEngine from "route-engine-js";

import { sanitizeProjectDataForRouteEngine } from "../src/internal/project/routeEngineProjectData.js";
import {
  initialProjectData,
  createProjectCreateCommand,
  repositoryEventToCommand,
  applyCommandToRepositoryState,
} from "../src/deps/services/shared/projectRepository.js";
import {
  loadSceneProjectionState,
  isSceneProjectionCheckpointFresh,
  isSceneProjectionCheckpointShapeValid,
} from "../src/deps/services/shared/projectRepositoryViews/sceneStateView.js";
import { createMainProjectionState } from "../src/deps/services/shared/projectRepositoryViews/shared.js";

const createEngine = () =>
  createRouteEngine({
    handlePendingEffects: () => {},
  });

const expectEngineInitToFail = (projectData, expectedMessagePart) => {
  const engine = createEngine();

  assert.throws(
    () => {
      engine.init({
        initialState: {
          global: {},
          projectData,
        },
      });
    },
    (error) => {
      assert.equal(error instanceof Error, true);
      assert.equal(
        String(error.message || "").includes(expectedMessagePart),
        true,
      );
      return true;
    },
  );
};

const expectEngineInitToSucceed = (projectData) => {
  const engine = createEngine();

  engine.init({
    initialState: {
      global: {},
      projectData,
    },
  });
};

const createBaseProjectData = () => ({
  story: {
    initialSceneId: "scene-1",
    scenes: {
      "scene-1": {
        id: "scene-1",
        name: "Scene 1",
        initialSectionId: "section-1",
        sections: {
          "section-1": {
            id: "section-1",
            name: "Section 1",
            initialLineId: "line-1",
            lines: [
              {
                id: "line-1",
                actions: {
                  dialogue: {
                    content: [{ text: "Hello" }],
                  },
                },
              },
            ],
          },
        },
      },
    },
  },
  resources: {
    layouts: {},
    controls: {},
    images: {},
    sounds: {},
    videos: {},
    fonts: {},
    textStyles: {},
    colors: {},
    variables: {},
    animations: {},
    characters: {},
    transforms: {},
  },
});

{
  const projectData = createBaseProjectData();
  projectData.story.initialSceneId = "missing-scene";

  expectEngineInitToFail(projectData, "reading 'initialSectionId'");

  const sanitized = sanitizeProjectDataForRouteEngine(projectData);
  assert.equal(sanitized.didSanitize, true);
  assert.deepEqual(sanitized.changes, [
    {
      type: "initialSceneId",
      from: "missing-scene",
      to: "scene-1",
    },
  ]);
  assert.equal(sanitized.projectData.story.initialSceneId, "scene-1");

  expectEngineInitToSucceed(sanitized.projectData);
}

{
  const projectData = createBaseProjectData();
  projectData.story.scenes["scene-1"].sections["section-1"].lines = [
    undefined,
    {
      id: "line-1",
      actions: {
        dialogue: {
          content: [{ text: "Hello" }],
        },
      },
    },
    { actions: {} },
  ];

  const sanitized = sanitizeProjectDataForRouteEngine(projectData);
  assert.equal(sanitized.didSanitize, true);
  assert.deepEqual(sanitized.changes, [
    {
      type: "invalidLines",
      sceneId: "scene-1",
      sectionId: "section-1",
      removed: 2,
    },
  ]);
  assert.deepEqual(
    sanitized.projectData.story.scenes["scene-1"].sections["section-1"].lines,
    [
      {
        id: "line-1",
        actions: {
          dialogue: {
            content: [{ text: "Hello" }],
          },
        },
      },
    ],
  );

  expectEngineInitToSucceed(sanitized.projectData);
}

{
  const projectData = createBaseProjectData();
  projectData.story.scenes["scene-1"].sections["section-1"].lines = [];
  delete projectData.story.scenes["scene-1"].sections["section-1"]
    .initialLineId;

  expectEngineInitToFail(projectData, "reading 'id'");

  const sanitized = sanitizeProjectDataForRouteEngine(projectData);
  assert.equal(sanitized.didSanitize, true);
  assert.deepEqual(sanitized.changes, [
    {
      type: "initialLineId",
      sceneId: "scene-1",
      sectionId: "section-1",
      from: undefined,
      to: "__empty__",
    },
  ]);
  assert.equal(
    sanitized.projectData.story.scenes["scene-1"].sections["section-1"]
      .initialLineId,
    "__empty__",
  );
  assert.deepEqual(
    sanitized.projectData.story.scenes["scene-1"].sections["section-1"].lines,
    [],
  );

  expectEngineInitToSucceed(sanitized.projectData);
}

{
  const projectData = createBaseProjectData();
  projectData.story.scenes["scene-1"].sections["section-1"].initialLineId =
    "missing-line";

  const sanitized = sanitizeProjectDataForRouteEngine(projectData);
  assert.equal(sanitized.didSanitize, true);
  assert.deepEqual(sanitized.changes, [
    {
      type: "initialLineId",
      sceneId: "scene-1",
      sectionId: "section-1",
      from: "missing-line",
      to: "line-1",
    },
  ]);
  assert.equal(
    sanitized.projectData.story.scenes["scene-1"].sections["section-1"]
      .initialLineId,
    "line-1",
  );

  expectEngineInitToSucceed(sanitized.projectData);
}

{
  const narrowCheckpointValue = {
    scenes: {
      items: {
        "scene-1": {
          id: "scene-1",
          sections: {
            items: {},
          },
        },
      },
    },
  };
  const wideLegacyCheckpointValue = {
    project: {},
    scenes: {
      items: {
        "scene-1": {
          id: "scene-1",
          sections: {
            items: {},
          },
        },
        "scene-2": {
          id: "scene-2",
          sections: {
            items: {},
          },
        },
      },
    },
    layouts: {
      items: {},
    },
  };

  assert.equal(
    isSceneProjectionCheckpointShapeValid({
      value: narrowCheckpointValue,
      sceneId: "scene-1",
    }),
    true,
  );
  assert.equal(
    isSceneProjectionCheckpointFresh({
      checkpoint: {
        viewVersion: "1",
        lastCommittedId: 25,
        value: narrowCheckpointValue,
      },
      latestRelevantRevision: 25,
      sceneId: "scene-1",
    }),
    true,
  );

  assert.equal(
    isSceneProjectionCheckpointShapeValid({
      value: wideLegacyCheckpointValue,
      sceneId: "scene-1",
    }),
    false,
  );
  assert.equal(
    isSceneProjectionCheckpointFresh({
      checkpoint: {
        viewVersion: "1",
        lastCommittedId: 25,
        value: wideLegacyCheckpointValue,
      },
      latestRelevantRevision: 25,
      sceneId: "scene-1",
    }),
    false,
  );
}

{
  const projectId = "project-1";
  const seededState = {
    ...structuredClone(initialProjectData),
    story: {
      initialSceneId: "scene-1",
    },
    scenes: {
      items: {
        "scene-1": {
          id: "scene-1",
          type: "scene",
          name: "Scene 1",
          sections: {
            items: {
              "section-1": {
                id: "section-1",
                name: "Section 1",
                lines: {
                  items: {
                    "line-1": {
                      id: "line-1",
                      actions: {
                        dialogue: {
                          content: [{ text: "Hello" }],
                        },
                      },
                    },
                  },
                  tree: [{ id: "line-1" }],
                },
              },
            },
            tree: [{ id: "section-1" }],
          },
        },
      },
      tree: [{ id: "scene-1" }],
    },
  };

  const projectCreateCommand = createProjectCreateCommand({
    projectId,
    state: seededState,
    commandId: "project-create:test",
    clientTs: 1,
    partition: "m",
  });
  const projectCreateEvent = {
    id: projectCreateCommand.id,
    partition: projectCreateCommand.partition,
    projectId: projectCreateCommand.projectId,
    type: projectCreateCommand.type,
    schemaVersion: projectCreateCommand.schemaVersion,
    payload: structuredClone(projectCreateCommand.payload),
    meta: {
      clientTs: projectCreateCommand.clientTs,
    },
  };

  const applied = applyCommandToRepositoryState({
    repositoryState: structuredClone(initialProjectData),
    command: repositoryEventToCommand(projectCreateEvent),
    projectId,
  });
  assert.equal(applied.valid, true);

  const mainState = createMainProjectionState(applied.repositoryState);
  const sceneProjection = await loadSceneProjectionState({
    store: {},
    mainState,
    events: [projectCreateEvent],
    createInitialState: () => structuredClone(initialProjectData),
    reduceEventToState: ({ repositoryState, event }) => {
      const result = applyCommandToRepositoryState({
        repositoryState,
        command: repositoryEventToCommand(event),
        projectId,
      });
      return result.repositoryState;
    },
    sceneId: "scene-1",
    latestRelevantRevision: 0,
  });

  const section =
    sceneProjection.scenes.items["scene-1"].sections.items["section-1"];
  assert.equal(section.lines.tree.length, 1);
  assert.deepEqual(section.lines.tree[0], { id: "line-1" });
}

console.log("Route engine project data tests: PASS");
