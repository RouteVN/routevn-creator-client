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
  items: { items: {}, tree: [] },

  defaultValues: {
    sceneId: undefined,
    sectionId: undefined,
    animation: "fade",
  },
  formValues: {},
});

export const setMode = (state, payload) => {
  state.mode = payload.mode;
};

export const setItems = (state, payload) => {
  state.items = payload.items;
};

export const setFormValues = (state, payload) => {
  state.formValues = payload;
};

export const setSceneId = (state, payload) => {
  state.defaultValues.sceneId = payload.sceneId;
};

export const selectViewData = ({ state, props }) => {
  const allItems = toFlatItems(state.items);
  const allScenes = allItems.filter((item) => item.type === "scene");
  const currentSceneSections = props?.sections || [];

  let breadcrumb = [
    {
      id: "actions",
      label: "Actions",
    },
    {
      label: "Transition",
    },
  ];

  // Build scene options - include all scenes
  const sceneOptions = allScenes.map((scene) => ({
    value: scene.id,
    label: scene.name,
  }));

  // Determine which sections to show based on selected scene
  let sectionOptions = [];
  const selectedSceneId = state.formValues?.sceneId || props?.currentSceneId;

  if (selectedSceneId) {
    if (selectedSceneId === props?.currentSceneId) {
      // Show sections from current scene
      sectionOptions = currentSceneSections.map((section) => ({
        value: section.id,
        label: section.name,
      }));
    } else {
      // Show sections from the selected other scene
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

  // Prepare default values - set current scene as default if not already set
  const defaultValues = {
    ...state.defaultValues,
    sceneId: state.defaultValues.sceneId || props?.currentSceneId,
  };

  const context = {
    sceneOptions,
    sectionOptions,
  };

  return {
    mode: state.mode,
    breadcrumb,
    form,
    context,
    defaultValues,
  };
};
