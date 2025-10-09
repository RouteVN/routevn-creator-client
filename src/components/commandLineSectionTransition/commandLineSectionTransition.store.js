import { toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    {
      name: "sceneId",
      inputType: "select",
      label: "Scene",
      description: "",
      required: false,
      placeholder: "Choose a scene",
      options: "${sceneOptions}",
    },
    {
      name: "sectionId",
      inputType: "select",
      label: "Section",
      description: "",
      required: false,
      placeholder: "Choose a section",
      options: "${sectionOptions}",
    },
    // {
    //   name: "animation",
    //   inputType: "select",
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
  scenes: { items: {}, tree: [] },
  formValues: {},
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setScenes = (state, payload) => {
  state.scenes = payload.scenes;
};

export const setFormValues = (state, payload) => {
  state.formValues = payload;
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
    mode: state.mode,
    breadcrumb,
    form,
    context,
    defaultValues: state.formValues,
  };
};
