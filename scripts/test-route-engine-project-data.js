import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import createRouteEngine from "route-engine-js";

import { sanitizeProjectDataForRouteEngine } from "../src/internal/project/routeEngineProjectData.js";
import { constructProjectData } from "../src/internal/project/projection.js";
import {
  scaleLayoutElementsForProjectResolution,
  scaleTemplateProjectStateForResolution,
} from "../src/internal/projectResolution.js";
import {
  assertSupportedProjectState,
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
  const projectData = constructProjectData(structuredClone(initialProjectData));

  assert.deepEqual(projectData.screen, {
    width: 1920,
    height: 1080,
    backgroundColor: "#000000",
  });
  assert.deepEqual(projectData.resources.variables, {});
}

{
  const repositoryState = structuredClone(initialProjectData);
  repositoryState.project = {};

  assert.throws(() => {
    constructProjectData(repositoryState);
  }, /Repository project resolution is required/);
}

{
  const repositoryState = structuredClone(initialProjectData);
  repositoryState.project = {
    resolution: {
      width: 1280,
      height: 720,
    },
  };

  const projectData = constructProjectData(repositoryState);

  assert.deepEqual(projectData.screen, {
    width: 1280,
    height: 720,
    backgroundColor: "#000000",
  });
}

{
  const scaledElements = scaleLayoutElementsForProjectResolution(
    {
      items: {
        background: {
          id: "background",
          type: "sprite",
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
        },
        title: {
          id: "title",
          type: "text",
          x: 960,
          y: 250,
          width: 800,
          height: 100,
          anchorX: 0.5,
          anchorY: 0.5,
          textStyle: {
            wordWrapWidth: 300,
          },
        },
      },
      tree: [{ id: "background" }, { id: "title" }],
    },
    {
      width: 1280,
      height: 720,
    },
  );

  assert.equal(scaledElements.items.background.width, 1280);
  assert.equal(scaledElements.items.background.height, 720);
  assert.equal(scaledElements.items.title.x, 640);
  assert.equal(scaledElements.items.title.y, 167);
  assert.equal(scaledElements.items.title.width, 533);
  assert.equal(scaledElements.items.title.height, 67);
  assert.equal(scaledElements.items.title.textStyle.wordWrapWidth, 200);
  assert.equal(
    Object.hasOwn(scaledElements.items.title.textStyle, "fontSize"),
    false,
  );
}

{
  const templateState = {
    project: {
      resolution: {
        width: 1920,
        height: 1080,
      },
    },
    transforms: {
      items: {
        center: {
          id: "center",
          type: "transform",
          x: 960,
          y: 1080,
        },
      },
      tree: [{ id: "center" }],
    },
    layouts: {
      items: {
        title: {
          id: "title",
          type: "layout",
          elements: {
            items: {
              background: {
                id: "background",
                type: "sprite",
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
              },
            },
            tree: [{ id: "background" }],
          },
        },
      },
      tree: [{ id: "title" }],
    },
    controls: {
      items: {
        main: {
          id: "main",
          type: "control",
          elements: {
            items: {
              overlay: {
                id: "overlay",
                type: "rect",
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
              },
            },
            tree: [{ id: "overlay" }],
          },
        },
      },
      tree: [{ id: "main" }],
    },
    textStyles: {
      items: {
        default: {
          id: "default",
          type: "textStyle",
          fontSize: 24,
        },
      },
      tree: [{ id: "default" }],
    },
  };

  const scaledTemplateState = scaleTemplateProjectStateForResolution(
    templateState,
    {
      width: 1280,
      height: 720,
    },
  );

  assert.deepEqual(scaledTemplateState.project.resolution, {
    width: 1280,
    height: 720,
  });
  assert.equal(scaledTemplateState.transforms.items.center.x, 640);
  assert.equal(scaledTemplateState.transforms.items.center.y, 720);
  assert.equal(
    scaledTemplateState.layouts.items.title.elements.items.background.width,
    1280,
  );
  assert.equal(
    scaledTemplateState.layouts.items.title.elements.items.background.height,
    720,
  );
  assert.equal(
    scaledTemplateState.controls.items.main.elements.items.overlay.width,
    1280,
  );
  assert.equal(
    scaledTemplateState.controls.items.main.elements.items.overlay.height,
    720,
  );
  assert.equal(scaledTemplateState.textStyles.items.default.fontSize, 16);
  assert.equal(templateState.transforms.items.center.x, 960);
  assert.equal(
    templateState.layouts.items.title.elements.items.background.width,
    1920,
  );
}

{
  const defaultTemplateState = JSON.parse(
    readFileSync(
      new URL("../static/templates/default/repository.json", import.meta.url),
      "utf8",
    ),
  );
  const scaledTemplateState = scaleTemplateProjectStateForResolution(
    defaultTemplateState,
    {
      width: 1280,
      height: 720,
    },
  );

  assert.doesNotThrow(() => {
    assertSupportedProjectState(scaledTemplateState);
  });
}

{
  const repositoryState = structuredClone(initialProjectData);
  repositoryState.animations.items["bg-slide-in"] = {
    id: "bg-slide-in",
    type: "animation",
    name: "Background Slide In",
    animation: {
      type: "transition",
      next: {
        tween: {
          alpha: {
            initialValue: 0,
            keyframes: [
              {
                duration: 500,
                value: 1,
              },
            ],
          },
        },
      },
    },
  };
  repositoryState.animations.tree = [{ id: "bg-slide-in" }];

  const projectData = constructProjectData(repositoryState);
  const backgroundAnimation = projectData.resources.animations["bg-slide-in"];

  assert.equal(typeof backgroundAnimation, "object");
  assert.equal(backgroundAnimation.type, "transition");
  assert.equal(backgroundAnimation.animation, undefined);
  assert.equal(backgroundAnimation.next.tween.alpha.keyframes[0].duration, 500);
}

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
