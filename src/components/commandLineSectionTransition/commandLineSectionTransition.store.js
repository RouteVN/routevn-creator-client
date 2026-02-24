import { toFlatItems } from "#insieme-compat";

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
    // {
    //   name: "animation",
    //   type: "select",
    //   label: "Transition Animation",
    //   description: "",
    //   required: false,
    //   placeholder: "Choose animation...",
    //   options: [
    //     { value: "fade", label: "Fade" },
    //     { value: "slide", label: "Slide" },
    //     { value: "dissolve", label: "Dissolve" },
    //     { value: "wipe", label: "Wipe" },
    //     { value: "none", label: "None" },
    //   ],
    // },
  ],
  actions: {
    layout: "",
    buttons: [],
  },
};

export const createInitialState = () => ({
  mode: "current",
  initiated: false,
  scenes: { items: {}, tree: [] },
  formValues: {},
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode;
};

export const setInitiated = ({ state }, _payload = {}) => {
  state.initiated = true;
};

export const setScenes = ({ state }, { scenes } = {}) => {
  state.scenes = scenes;
};

export const setFormValues = ({ state }, values = {}) => {
  state.formValues = values;
};

export const selectViewData = ({ state, props }) => {
  const scenes = toFlatItems(state.scenes);
  const allScenes = scenes.filter((item) => item.type === "scene");
  const selectedSceneId = state.formValues?.sceneId || props?.currentSceneId;

  const currentScene = allScenes.find((item) => item.id === selectedSceneId);
  const currentSceneSections = currentScene?.sections
    ? toFlatItems(currentScene?.sections)
    : [];

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: "Transition",
    },
  ];

  const sceneOptions = allScenes.map((scene) => ({
    value: scene.id,
    label: scene.name,
  }));

  let sectionOptions = [];

  if (selectedSceneId) {
    if (selectedSceneId === props?.currentSceneId) {
      sectionOptions = currentSceneSections.map((section) => ({
        value: section.id,
        label: section.name,
      }));
    } else {
      const selectedScene = allScenes.find(
        (scene) => scene.id === selectedSceneId,
      );
      if (selectedScene && selectedScene.sections) {
        const sceneSections = toFlatItems(selectedScene.sections);
        sectionOptions = sceneSections.map((section) => ({
          value: section.id,
          label: section.name,
        }));
      }
    }
  }

  const context = {
    sceneOptions,
    sectionOptions,
  };

  return {
    initiated: state.initiated,
    mode: state.mode,
    breadcrumb,
    form,
    context,
    defaultValues: state.formValues,
  };
};
