import { toFlatItems } from "../../deps/repository";

const form = {
  fields: [
    {
      name: "sameScene",
      inputType: "select",
      label: "Type",
      description: "",
      required: false,
      placeholder: "Choose Target",
      options: [
        { value: "this_scene", label: "This Scene" },
        { value: "other_scene", label: "Other Scene" },
      ],
    },
    {
      '$if sameScene == "other_scene"': {
        name: "sceneId",
        inputType: "select",
        label: "Target Scene",
        description: "",
        required: false,
        placeholder: "Choose a scene",
        options: "${sceneOptions}",
      },
    },
    {
      name: "sectionId",
      inputType: "select",
      label: "Target Section",
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
    sameScene: "this_scene",
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

  // Determine which sections to show based on form values
  let sectionOptions = [];

  if (
    state.formValues?.sameScene === "other_scene" &&
    state.formValues?.sceneId
  ) {
    // Show sections from the selected other scene
    const selectedScene = allScenes.find(
      (scene) => scene.id === state.formValues.sceneId,
    );
    if (selectedScene && selectedScene.sections) {
      const sceneSections = toFlatItems(selectedScene.sections);
      sectionOptions = sceneSections.map((section) => ({
        value: section.id,
        label: section.name,
      }));
    }
  } else {
    // Show sections from current scene (this_scene)
    sectionOptions = currentSceneSections.map((section) => ({
      value: section.id,
      label: section.name,
    }));
  }

  // Filter out the current scene from sceneOptions when in "other_scene" mode
  const sceneOptions = allScenes
    .filter((scene) => scene.id !== props?.currentSceneId)
    .map((scene) => ({
      value: scene.id,
      label: scene.name,
    }));

  const context = {
    sceneOptions,
    sectionOptions,
    sameScene: state.formValues?.sameScene,
  };

  return {
    mode: state.mode,
    breadcrumb,
    form,
    context,
    defaultValues: state.defaultValues,
  };
};
