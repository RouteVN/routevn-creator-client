import { generateId } from "../../id.js";
import { getLayoutEditorCreateDefinition } from "../../layoutEditorElementRegistry.js";
import {
  getFirstParticleSelectionValue,
  getParticleResourceDefaultSize,
  toParticleSelectionItems,
} from "../../particles.js";
import { isFragmentLayout } from "../../project/layout.js";
import { toFlatItems } from "../../project/tree.js";
import {
  getFirstSpritesheetAnimationSelectionValue,
  getSpritesheetResourceDefaultSize,
  parseSpritesheetAnimationSelectionValue,
  toSpritesheetAnimationSelectionItems,
} from "../../spritesheets.js";
import { getFragmentLayoutOptions } from "./layoutFragments.js";
import { createLayoutEditorElementTemplate } from "./layoutEditorViewData.js";

// A layout editor's "new" menu adds most elements as they are. These ask the
// user first for what the element needs, such as the image of a sprite.

const SLIDER_CREATE_DIALOG_COMPONENT = "rvn-layout-editor-slider-create-dialog";
const SPRITE_CREATE_DIALOG_COMPONENT = "rvn-layout-editor-sprite-create-dialog";

const NEW_ELEMENT_ACTION = "new-child-item";

const createDialogButtons = (copy, submitLabel) => [
  {
    id: "cancel",
    variant: "se",
    label: copy.cancelButton ?? "Cancel",
    align: "left",
  },
  {
    id: "submit",
    variant: "pr",
    label: submitLabel,
    validate: true,
  },
];

const createFragmentCreateForm = (fragmentLayoutOptions, copy) => ({
  title: copy.insertFragmentTitle ?? "Insert Fragment",
  description:
    copy.insertFragmentDescription ??
    "Choose which fragment layout to insert into this layout",
  fields: [
    {
      name: "fragmentLayoutId",
      type: "select",
      label: copy.fragmentLabel ?? "Fragment",
      required: true,
      clearable: false,
      options: fragmentLayoutOptions,
    },
  ],
  actions: {
    buttons: createDialogButtons(
      copy,
      copy.insertFragmentButton ?? "Insert Fragment",
    ),
  },
});

const createSpritesheetCreateForm = (selectionItems, copy) => ({
  title: copy.createSpritesheetAnimationTitle ?? "Create Spritesheet Animation",
  description:
    copy.createSpritesheetAnimationDescription ??
    "Choose which imported spritesheet animation to insert into the layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "spritesheetSelection",
      type: "select",
      label: copy.animationLabel ?? "Animation",
      required: true,
      clearable: false,
      options: selectionItems,
    },
  ],
  actions: {
    buttons: createDialogButtons(
      copy,
      copy.createAnimationButton ?? "Create Animation",
    ),
  },
});

const createParticleCreateForm = (selectionItems, copy) => ({
  title: copy.createParticleTitle ?? "Create Particle",
  description:
    copy.createParticleDescription ??
    "Choose which particle effect to insert into the layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "particleId",
      type: "select",
      label: copy.particleLabel ?? "Particle",
      required: true,
      clearable: false,
      options: selectionItems,
    },
  ],
  actions: {
    buttons: createDialogButtons(
      copy,
      copy.createParticleButton ?? "Create Particle",
    ),
  },
});

const createVideoCreateForm = (selectionItems, copy) => ({
  title: copy.createVideoTitle ?? "Create Video",
  description:
    copy.createVideoDescription ??
    "Choose which video to insert into the layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    {
      name: "videoId",
      type: "select",
      label: copy.videoLabel ?? "Video",
      required: true,
      clearable: false,
      options: selectionItems,
    },
  ],
  actions: {
    buttons: createDialogButtons(
      copy,
      copy.createVideoButton ?? "Create Video",
    ),
  },
});

const createComponentDialogButtons = (copy, submitLabel) => [
  {
    id: "cancel",
    label: copy.cancelButton ?? "Cancel",
    variant: "se",
    align: "left",
    role: "cancel",
  },
  {
    id: "create",
    label: submitLabel,
    variant: "pr",
    role: "confirm",
    validate: true,
  },
];

const showSliderCreateDialog = (appService, sliderAction, copy) =>
  appService.showComponentDialog({
    component: SLIDER_CREATE_DIALOG_COMPONENT,
    title: copy.createSliderTitle ?? "Create Slider",
    description:
      copy.createSliderDescription ??
      "Choose the slider images before inserting it into the layout",
    size: "md",
    props: {
      direction: sliderAction.direction,
      defaultValues: {
        name: sliderAction.name ?? copy.sliderDefaultName ?? "Slider",
      },
    },
    actions: {
      buttons: createComponentDialogButtons(
        copy,
        copy.createSliderButton ?? "Create Slider",
      ),
    },
  });

const showSpriteCreateDialog = (appService, spriteAction, copy) =>
  appService.showComponentDialog({
    component: SPRITE_CREATE_DIALOG_COMPONENT,
    title: copy.createImageTitle ?? "Create Image",
    description:
      copy.createImageDescription ??
      "Choose the image before inserting it into the layout",
    size: "md",
    props: {
      defaultValues: {
        name: spriteAction.name ?? copy.imageDefaultName ?? "Image",
      },
    },
    actions: {
      buttons: createComponentDialogButtons(
        copy,
        copy.createImageButton ?? "Create Image",
      ),
    },
  });

const warn = (appService, copy, message) => {
  appService.showAlert({ message, title: copy.warningTitle ?? "Warning" });
};

// An element whose width and height are known keeps its aspect ratio.
const lockAspectRatio = (data) => {
  if (
    Number.isFinite(data.width) &&
    Number.isFinite(data.height) &&
    data.width > 0 &&
    data.height > 0
  ) {
    data.aspectRatioLock = data.width / data.height;
  }
};

const setResourceSize = (data, size = {}) => {
  if (Number.isFinite(size.width) && size.width > 0) {
    data.width = size.width;
  }
  if (Number.isFinite(size.height) && size.height > 0) {
    data.height = size.height;
  }
  lockAspectRatio(data);
};

const newElement = ({ data, parentId, failedMessage }) => ({
  elementId: generateId(),
  data,
  parentId,
  position: "first",
  failedMessage,
});

const promptSaveLoadSlot = ({ copy, parentId, projectResolution }) => {
  const options = { projectResolution, copy };
  const slot = newElement({
    data: createLayoutEditorElementTemplate(
      "container-save-load-slot",
      options,
    ),
    parentId,
    failedMessage:
      copy.failedCreateSaveLoadSlot ?? "Failed to create save/load slot.",
  });
  const inSlot = (type, failedMessage) => ({
    elementId: generateId(),
    data: createLayoutEditorElementTemplate(type, options),
    parentId: slot.elementId,
    position: "last",
    failedMessage,
  });
  return [
    slot,
    inSlot(
      "sprite-save-load-slot-image",
      copy.failedCreateSaveLoadSlotImage ??
        "Failed to create save/load slot image.",
    ),
    inSlot(
      "text-save-load-slot-date",
      copy.failedCreateSaveLoadSlotDate ??
        "Failed to create save/load slot date.",
    ),
  ];
};

const promptFragment = async ({
  appService,
  copy,
  parentId,
  projectResolution,
  resources,
  layoutId,
}) => {
  const fragmentLayoutOptions = getFragmentLayoutOptions(resources.layouts, {
    excludeLayoutId: layoutId,
  });
  if (fragmentLayoutOptions.length === 0) {
    warn(
      appService,
      copy,
      copy.markLayoutAsFragmentFirst ?? "Mark a layout as a fragment first.",
    );
    return undefined;
  }

  const dialogResult = await appService.showFormDialog({
    form: createFragmentCreateForm(fragmentLayoutOptions, copy),
    defaultValues: { fragmentLayoutId: fragmentLayoutOptions[0].value },
  });
  if (dialogResult?.actionId !== "submit") {
    return undefined;
  }

  const fragmentLayoutId = dialogResult.values?.fragmentLayoutId;
  if (!fragmentLayoutId) {
    warn(appService, copy, copy.fragmentRequired ?? "Fragment is required.");
    return undefined;
  }

  const fragmentLayout = resources.layouts?.items?.[fragmentLayoutId];
  if (fragmentLayout?.type !== "layout" || !isFragmentLayout(fragmentLayout)) {
    appService.showAlert({
      message: copy.selectedFragmentInvalid ?? "Selected fragment is invalid.",
      title: copy.errorTitle ?? "Error",
    });
    return undefined;
  }

  return [
    newElement({
      data: {
        ...getLayoutEditorCreateDefinition("fragment-ref", {
          projectResolution,
        }).template,
        name: fragmentLayout.name ?? copy.fragmentDefaultName ?? "Fragment",
        fragmentLayoutId,
      },
      parentId,
      failedMessage: copy.failedCreateFragment ?? "Failed to create fragment.",
    }),
  ];
};

const promptSpritesheetAnimation = async ({
  action,
  appService,
  copy,
  parentId,
  projectResolution,
  resources,
}) => {
  const spritesheetsData = resources.spritesheets;
  const selectionItems = toSpritesheetAnimationSelectionItems(spritesheetsData);
  if (selectionItems.length === 0) {
    warn(
      appService,
      copy,
      copy.importSpritesheetFirst ?? "Import a spritesheet first.",
    );
    return undefined;
  }

  const dialogResult = await appService.showFormDialog({
    form: createSpritesheetCreateForm(selectionItems, copy),
    defaultValues: {
      name:
        action.name ??
        copy.spritesheetAnimationDefaultName ??
        "Spritesheet Animation",
      spritesheetSelection:
        getFirstSpritesheetAnimationSelectionValue(spritesheetsData),
    },
  });
  if (dialogResult?.actionId !== "submit") {
    return undefined;
  }

  const name = dialogResult.values?.name?.trim();
  if (!name) {
    warn(
      appService,
      copy,
      copy.animationNameRequired ?? "Animation name is required.",
    );
    return undefined;
  }

  const { resourceId, animationName } = parseSpritesheetAnimationSelectionValue(
    dialogResult.values?.spritesheetSelection,
  );
  if (!resourceId || !animationName) {
    warn(
      appService,
      copy,
      copy.spritesheetAnimationRequired ?? "Spritesheet animation is required.",
    );
    return undefined;
  }

  const data = {
    ...getLayoutEditorCreateDefinition("spritesheet-animation", {
      projectResolution,
    }).template,
    name,
    resourceId,
    animationName,
  };
  setResourceSize(
    data,
    getSpritesheetResourceDefaultSize(spritesheetsData, resourceId),
  );
  return [
    newElement({
      data,
      parentId,
      failedMessage:
        copy.failedCreateSpritesheetAnimation ??
        "Failed to create spritesheet animation.",
    }),
  ];
};

const promptVideo = async ({
  action,
  appService,
  copy,
  parentId,
  projectResolution,
  resources,
}) => {
  const videosData = resources.videos;
  const selectionItems = toFlatItems(videosData)
    .filter((item) => item.type === "video")
    .map((item) => ({ label: item.name, value: item.id }));
  if (selectionItems.length === 0) {
    warn(appService, copy, copy.createVideoFirst ?? "Create a video first.");
    return undefined;
  }

  const failedMessage = copy.failedCreateVideo ?? "Failed to create video.";
  let dialogResult;
  try {
    dialogResult = await appService.showFormDialog({
      form: createVideoCreateForm(selectionItems, copy),
      defaultValues: {
        name: action.name ?? copy.videoDefaultName ?? "Video",
        videoId: selectionItems[0]?.value,
      },
    });
  } catch {
    appService.showToast({ message: failedMessage });
    return undefined;
  }
  if (dialogResult?.actionId !== "submit") {
    return undefined;
  }

  const name = dialogResult.values?.name?.trim();
  if (!name) {
    warn(appService, copy, copy.videoNameRequired ?? "Video name is required.");
    return undefined;
  }

  const videoId = dialogResult.values?.videoId;
  if (!videoId) {
    warn(appService, copy, copy.videoRequired ?? "Video is required.");
    return undefined;
  }

  const data = {
    ...getLayoutEditorCreateDefinition("video", { projectResolution }).template,
    name,
    videoId,
  };
  const video = videosData.items[videoId];
  const hasSize =
    Number.isFinite(video.width) &&
    video.width > 0 &&
    Number.isFinite(video.height) &&
    video.height > 0;
  data.width = hasSize ? video.width : 640;
  data.height = hasSize ? video.height : 360;
  data.aspectRatioLock = data.width / data.height;
  return [newElement({ data, parentId, failedMessage })];
};

const promptParticle = async ({
  action,
  appService,
  copy,
  parentId,
  projectResolution,
  resources,
}) => {
  const particlesData = resources.particles;
  const selectionItems = toParticleSelectionItems(particlesData);
  if (selectionItems.length === 0) {
    warn(
      appService,
      copy,
      copy.createParticleEffectFirst ?? "Create a particle effect first.",
    );
    return undefined;
  }

  const dialogResult = await appService.showFormDialog({
    form: createParticleCreateForm(selectionItems, copy),
    defaultValues: {
      name: action.name ?? copy.particleDefaultName ?? "Particle",
      particleId: getFirstParticleSelectionValue(particlesData),
    },
  });
  if (dialogResult?.actionId !== "submit") {
    return undefined;
  }

  const name = dialogResult.values?.name?.trim();
  if (!name) {
    warn(
      appService,
      copy,
      copy.particleNameRequired ?? "Particle name is required.",
    );
    return undefined;
  }

  const particleId = dialogResult.values?.particleId;
  if (!particleId) {
    warn(appService, copy, copy.particleRequired ?? "Particle is required.");
    return undefined;
  }

  const data = {
    ...getLayoutEditorCreateDefinition("particle", { projectResolution })
      .template,
    name,
    particleId,
  };
  setResourceSize(
    data,
    getParticleResourceDefaultSize(particlesData, particleId),
  );
  return [
    newElement({
      data,
      parentId,
      failedMessage: copy.failedCreateParticle ?? "Failed to create particle.",
    }),
  ];
};

const promptSprite = async ({
  action,
  appService,
  copy,
  parentId,
  projectResolution,
  resources,
}) => {
  let dialogResult;
  try {
    dialogResult = await showSpriteCreateDialog(appService, action, copy);
  } catch {
    appService.showAlert({
      message: copy.failedOpenImageDialog ?? "Failed to open image dialog.",
      title: copy.errorTitle ?? "Error",
    });
    return undefined;
  }
  if (dialogResult?.actionId !== "create") {
    return undefined;
  }

  const values = dialogResult.values ?? {};
  const name = values.name?.trim();
  if (!name) {
    warn(appService, copy, copy.imageNameRequired ?? "Image name is required.");
    return undefined;
  }

  const { imageId } = values;
  if (!imageId) {
    warn(appService, copy, copy.imageRequired ?? "Image is required.");
    return undefined;
  }

  const data = {
    ...getLayoutEditorCreateDefinition("sprite", { projectResolution })
      .template,
    name,
    imageId,
  };
  setResourceSize(data, resources.images?.items?.[imageId]);
  return [
    newElement({
      data,
      parentId,
      failedMessage: copy.failedCreateImage ?? "Failed to create image.",
    }),
  ];
};

const promptSlider = async ({
  action,
  appService,
  copy,
  parentId,
  projectResolution,
}) => {
  let dialogResult;
  try {
    dialogResult = await showSliderCreateDialog(appService, action, copy);
  } catch {
    appService.showAlert({
      message: copy.failedOpenSliderDialog ?? "Failed to open slider dialog.",
      title: copy.errorTitle ?? "Error",
    });
    return undefined;
  }
  if (dialogResult?.actionId !== "create") {
    return undefined;
  }

  const values = dialogResult.values ?? {};
  const name = values.name?.trim();
  if (!name) {
    warn(
      appService,
      copy,
      copy.sliderNameRequired ?? "Slider name is required.",
    );
    return undefined;
  }

  const { barImageId, thumbImageId, hoverBarImageId, hoverThumbImageId } =
    values;
  if (!barImageId) {
    warn(appService, copy, copy.barImageRequired ?? "Bar image is required.");
    return undefined;
  }
  if (!thumbImageId) {
    warn(
      appService,
      copy,
      copy.thumbImageRequired ?? "Thumb image is required.",
    );
    return undefined;
  }

  const createType =
    values.direction === "vertical" ? "slider-vertical" : "slider-horizontal";
  const data = {
    ...getLayoutEditorCreateDefinition(createType, { projectResolution })
      .template,
    name,
    barImageId,
    thumbImageId,
  };
  if (hoverBarImageId) {
    data.hoverBarImageId = hoverBarImageId;
  }
  if (hoverThumbImageId) {
    data.hoverThumbImageId = hoverThumbImageId;
  }
  return [
    newElement({
      data,
      parentId,
      failedMessage: copy.failedCreateSlider ?? "Failed to create slider.",
    }),
  ];
};

const PROMPTS_BY_TYPE = {
  "container-ref-save-load-slot": promptSaveLoadSlot,
  "fragment-ref": promptFragment,
  "spritesheet-animation": promptSpritesheetAnimation,
  video: promptVideo,
  particle: promptParticle,
  sprite: promptSprite,
  slider: promptSlider,
};

// The "new" menu action in a file explorer event, when it adds an element
// the user is asked about first.
export const resolvePromptedNewElementAction = (menuValue) => {
  if (
    menuValue?.action === NEW_ELEMENT_ACTION &&
    PROMPTS_BY_TYPE[menuValue.type]
  ) {
    return menuValue;
  }
  return undefined;
};

// Asks the user for what the new element of `action` needs and gives the
// elements to add, in order: the new element first, then any it holds. Each
// is `{ elementId, data, parentId, position, failedMessage }`. Gives undefined
// when the user cancels, or after telling them what is missing.
//
// `resources` holds the project's images, spritesheets, videos, particles and
// layouts collections. `layoutId` is the edited layout, which cannot be a
// fragment of itself.
export const promptLayoutEditorNewElements = ({
  action,
  appService,
  copy = {},
  parentId,
  projectResolution,
  resources = {},
  layoutId,
}) =>
  Promise.resolve(
    PROMPTS_BY_TYPE[action.type]({
      action,
      appService,
      copy,
      parentId,
      projectResolution,
      resources,
      layoutId,
    }),
  );
