import { MODEL_VERSION, RESOURCE_TYPES } from "./constants.js";

const createResourceCollection = () => ({
  items: {},
  tree: [],
});

const createVariableCollection = () => ({
  items: {},
  tree: [],
});

export const createEmptyProjectState = ({
  projectId,
  name = "",
  description = "",
}) => {
  const resources = Object.fromEntries(
    RESOURCE_TYPES.map((type) => [type, createResourceCollection()]),
  );

  return {
    model_version: MODEL_VERSION,
    project: {
      id: projectId,
      name,
      description,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    story: {
      initialSceneId: null,
      sceneOrder: [],
    },
    scenes: {},
    sections: {},
    lines: {},
    resources,
    layouts: {},
    layoutTree: [],
    variables: createVariableCollection(),
  };
};

export const isUuidLike = (value) =>
  typeof value === "string" && value.length >= 8;

export const touchUpdatedAt = (state, timestamp = Date.now()) => {
  if (!state.project) return;
  const current =
    typeof state.project.updatedAt === "number" ? state.project.updatedAt : 0;
  state.project.updatedAt = Math.max(current, timestamp);
};
