import { toFlatItems } from "../../internal/project/tree.js";

const form = {
  fields: [
    {
      name: "sceneId",
      type: "select",
      label: "Scene",
      description: "",
      required: true,
      placeholder: "Choose a scene",
      options: "${sceneOptions}",
    },
    {
      name: "sectionId",
      type: "select",
      label: "Section",
      description: "",
      required: true,
      placeholder: "Choose a section",
      options: "${sectionOptions}",
    },
  ],
  actions: {
    layout: "",
    buttons: [],
  },
};

export const createInitialState = () => ({
  scenes: { items: {}, tree: [] },
  formValues: {},
});

export const setScenes = ({ state }, { scenes } = {}) => {
  state.scenes = scenes ?? { items: {}, tree: [] };
};

export const setFormValues = ({ state }, { values } = {}) => {
  state.formValues = values ?? {};
};

export const selectViewData = ({ state, props }) => {
  const scenes = toFlatItems(state.scenes);
  const allScenes = scenes.filter((item) => item.type === "scene");
  const selectedSceneId = state.formValues?.sceneId || props?.currentSceneId;
  const selectedScene = allScenes.find((scene) => scene.id === selectedSceneId);
  const selectedSectionId = state.formValues?.sectionId;

  const sceneOptions = allScenes.map((scene) => ({
    value: scene.id,
    label: scene.name,
  }));

  let sectionOptions = [];
  if (selectedScene?.sections) {
    sectionOptions = toFlatItems(selectedScene.sections)
      .filter((section) => section.type !== "folder")
      .map((section) => ({
        value: section.id,
        label: section.name,
      }));
  }

  if (
    selectedSectionId &&
    !sectionOptions.some((option) => option.value === selectedSectionId)
  ) {
    sectionOptions.unshift({
      value: selectedSectionId,
      label: `Missing section (${selectedSectionId})`,
    });
  }

  return {
    breadcrumb: [
      {
        id: "actions",
        label: "Actions",
        click: true,
      },
      {
        label: "Reset Story At Section",
      },
    ],
    form,
    defaultValues: state.formValues,
    context: {
      sceneOptions,
      sectionOptions,
    },
  };
};
