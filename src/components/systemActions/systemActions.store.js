import {
  createRuntimeActionPreview,
  getRuntimeActionModes,
  isRuntimeActionMode,
} from "../../internal/runtimeActions.js";
import {
  buildCharacterSpritePreviewFileIds,
  buildCharacterSpritePreviewLayers,
} from "../../internal/characterSpritePreview.js";
import { normalizeLineActions } from "../../internal/project/engineActions.js";
import { getLayoutInputFieldItems } from "../../internal/project/layout.js";
import {
  formatCommandLineCopy,
  localizeCommandLineDropdownMenu,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

export const createInitialState = () => ({
  mode: "actions",
  actions: {},
  isTouchMode: false,
  isActionsDialogOpen: false,
  suppressDialogClose: false,
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    actionType: null,
    items: [
      {
        label: "Delete",
        icon: "trash",
        type: "item",
        value: "delete",
      },
    ],
  },
  repositoryState: {}, // Add this - default to empty object
  playingSound: {
    title: "",
    fileId: undefined,
  },
  showAudioPlayer: false,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

const getHiddenModes = (attrs = {}) => {
  if (!Array.isArray(attrs.hiddenModes)) {
    return [];
  }

  const hiddenModes = new Set();
  for (const mode of attrs.hiddenModes) {
    if (typeof mode === "string" && mode.length > 0) {
      hiddenModes.add(mode);
    }
  }

  return [...hiddenModes];
};

const getAllowedModes = (attrs = {}) => {
  return Array.isArray(attrs.allowedModes)
    ? attrs.allowedModes.filter(
        (mode) => typeof mode === "string" && mode.length > 0,
      )
    : [];
};

const getDialogVariant = (attrs = {}) =>
  attrs.dialogVariant === "scene-editor-left" ? "scene-editor-left" : "default";

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

const shouldShowEmbeddedClose = (attrs = {}) => {
  return (
    attrs.actionType === "system" &&
    parseBooleanProp(attrs.showEmbeddedClose, true)
  );
};

const buildColorPreview = (colors, colorId) => {
  if (!colorId) {
    return undefined;
  }

  const color = colors[colorId];
  if (!color) {
    return {
      colorId,
      colorName: colorId,
      colorHex: undefined,
    };
  }

  return {
    colorId,
    colorName: color.name ?? colorId,
    colorHex: color.hex,
  };
};

const resolveBackgroundPreviewAction = ({ actions, presentationState }) => {
  const actionBackground = isPlainObject(actions.background)
    ? actions.background
    : undefined;
  const effectiveBackground = isPlainObject(presentationState.background)
    ? presentationState.background
    : undefined;

  if (!actionBackground) {
    return effectiveBackground;
  }

  const previewBackground = { ...actionBackground };
  const hasAppearanceOnlyChange =
    Object.hasOwn(actionBackground, "opacity") ||
    Object.hasOwn(actionBackground, "blur");
  if (
    hasAppearanceOnlyChange &&
    !previewBackground.resourceId &&
    effectiveBackground?.resourceId
  ) {
    previewBackground.resourceId = effectiveBackground.resourceId;
  }
  if (
    hasAppearanceOnlyChange &&
    !previewBackground.colorId &&
    effectiveBackground?.colorId
  ) {
    previewBackground.colorId = effectiveBackground.colorId;
  }
  if (!previewBackground.resourceId && actionBackground.colorId) {
    previewBackground.resourceId = effectiveBackground?.resourceId;
  }
  if (!previewBackground.colorId && actionBackground.resourceId) {
    previewBackground.colorId = effectiveBackground?.colorId;
  }

  return previewBackground;
};

export const selectViewData = ({ state, props, props: attrs, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const displayActions = selectDisplayActions({ state });
  const actionProps = { ...props };
  actionProps.actions = selectAction({ state });
  const { actions: actionsObject, preview } = selectActionsData({
    props: actionProps,
    state,
    copy,
  });
  const hiddenModes = getHiddenModes(attrs);
  const allowedModes = getAllowedModes(attrs);

  const repositoryState = state.repositoryState;
  const choiceLayouts = Object.entries(repositoryState.layouts?.items || {})
    .filter(([_, layout]) => layout.layoutType === "choice")
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
    }));

  const inputLayouts = Object.entries(repositoryState.layouts?.items || {})
    .filter(([_, layout]) => layout.layoutType === "input")
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
      elements: layout.elements,
    }));

  const controlLayouts = Object.entries(repositoryState.controls?.items || {})
    .filter(([_, control]) => control.type === "control")
    .map(([id, control]) => ({
      id,
      name: control.name,
      type: control.type,
    }));

  const dialogueLayouts = Object.entries(repositoryState.layouts?.items || {})
    .filter(
      ([_, layout]) =>
        layout.layoutType === "dialogue-adv" ||
        layout.layoutType === "dialogue-nvl",
    )
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
    }));

  const confirmDialogLayouts = Object.entries(
    repositoryState.layouts?.items || {},
  )
    .filter(([_, layout]) => layout.layoutType === "confirmDialog")
    .map(([id, layout]) => ({
      id,
      name: layout.name,
      layoutType: layout.layoutType,
    }));

  const allCharacters = Object.entries(
    repositoryState.characters?.items || {},
  ).map(([id, character]) => ({
    id,
    ...character,
  }));

  return {
    currentSceneId: props.currentSceneId,
    mode: state.mode,
    isActionsDialogOpen: state.isActionsDialogOpen,
    dropdownMenu: localizeCommandLineDropdownMenu(state.dropdownMenu, copy),
    displayActions,
    actions: actionsObject,
    preview,
    playingSound: state.playingSound,
    showAudioPlayer: state.showAudioPlayer,
    repositoryState,
    selectedLineId: props.selectedLineId,
    layouts: choiceLayouts, // Default to choice layouts for backward compatibility
    choiceLayouts,
    inputLayouts,
    controlLayouts,
    dialogueLayouts,
    confirmDialogLayouts,
    allCharacters,
    characterTree: repositoryState.characters?.tree || [],
    transforms: repositoryState.transforms || { items: {}, tree: [] },
    animations: repositoryState.animations || { items: {}, tree: [] },
    selectedLine: props.selectedLine,
    actionsType: attrs.actionType,
    showSelected: !!attrs.showSelected,
    showEmbeddedClose: shouldShowEmbeddedClose(attrs),
    dialogVariant: getDialogVariant(attrs),
    actionsDialogWidth: state.isTouchMode ? "100%" : "800",
    actionsDialogHeight: state.isTouchMode ? "100vh" : "80vh",
    actionsDialogPanelWidth: state.isTouchMode
      ? "100vw"
      : (attrs.dialogPanelWidth ?? "50vw"),
    hiddenModes,
    allowedModes,
    suppressDialogClose:
      state.suppressDialogClose === true ||
      parseBooleanProp(attrs.suppressDialogClose, false) ||
      attrs.backgroundTransformEditor?.suppressActionsDialogClose === true,
    backgroundTransformEditor: attrs.backgroundTransformEditor ?? {},
    isRuntimeActionMode: isRuntimeActionMode(state.mode),
    previewVoiceLabel: localizeCommandLineText("Preview voice", copy),
    nextLineLabel: localizeCommandLineText("Next Line", copy),
    toggleAutoModeLabel: localizeCommandLineText("Toggle Auto Mode", copy),
    toggleSkipModeLabel: localizeCommandLineText("Toggle Skip Mode", copy),
    startSkipModeLabel: localizeCommandLineText("Start Skip Mode", copy),
    stopSkipModeLabel: localizeCommandLineText("Stop Skip Mode", copy),
    toggleDialogueUILabel: localizeCommandLineText(
      "Toggle Dialogue Box Visibility",
      copy,
    ),
    hideConfirmDialogLabel: localizeCommandLineText(
      "Hide confirm dialog",
      copy,
    ),
    nextLineConfigLabel: localizeCommandLineText("Next Line Config", copy),
    confirmButtonLabel: localizeCommandLineText("Confirm", copy),
  };
};

export const selectRepositoryState = ({ state }) => {
  return state.repositoryState;
};

export const setRepositoryState = ({ state }, { repositoryState } = {}) => {
  state.repositoryState = repositoryState;
};

export const selectDisplayActions = ({ state }) => {
  const actions = state.actions || {};
  return Object.entries(actions).map(([key, value]) => {
    return {
      name: key,
      payload: value,
    };
  });
};

export const selectAction = ({ state }) => {
  return state.actions || {};
};

export const selectVoicePreview = ({ state, props }) => {
  const actionProps = { ...props };
  actionProps.actions = selectAction({ state });
  return selectActionsData({
    props: actionProps,
    state,
  }).preview.voice;
};

export const selectMode = ({ state }) => {
  return state.mode;
};

export const updateActions = ({ state }, payload = {}) => {
  const previousVoiceResourceId = state.actions?.voice?.resourceId;
  const nextPayload = payload || {};
  const nextVoiceResourceId = nextPayload.voice?.resourceId;
  state.actions = { ...nextPayload };

  if (previousVoiceResourceId !== nextVoiceResourceId) {
    closeAudioPlayer({ state });
  }
};

export const showActionsDialog = ({ state }, _payload = {}) => {
  state.isActionsDialogOpen = true;
};

export const hideActionsDialog = ({ state }, _payload = {}) => {
  state.isActionsDialogOpen = false;
  state.suppressDialogClose = false;
  state.mode = "hidden";
};

export const setMode = ({ state }, payload = {}) => {
  const mode = payload.mode;
  if (mode === undefined) {
    return;
  }
  state.mode = mode;
};

export const setSuppressDialogClose = (
  { state },
  { suppressDialogClose } = {},
) => {
  state.suppressDialogClose = suppressDialogClose === true;
};

export const selectSuppressDialogClose = ({ state }) => {
  return state.suppressDialogClose === true;
};

export const openAudioPlayer = ({ state }, { fileId, fileName } = {}) => {
  state.playingSound.fileId = fileId;
  state.playingSound.title = fileName;
  state.showAudioPlayer = true;
};

export const closeAudioPlayer = ({ state }, _payload = {}) => {
  state.showAudioPlayer = false;
  state.playingSound = {
    title: "",
    fileId: undefined,
  };
};

const resolveDialogueModeLabel = (dialogue, layoutsItems) => {
  if (dialogue?.mode === "nvl") {
    return "NVL";
  }

  if (dialogue?.mode === "adv") {
    return "ADV";
  }

  const layoutId = dialogue?.ui?.resourceId ?? dialogue?.gui?.resourceId;
  const layoutType = layoutsItems?.[layoutId]?.layoutType;
  if (layoutType === "dialogue-nvl") {
    return "NVL";
  }

  return "ADV";
};

const truncatePreviewText = (value = "", maxLength = 36) => {
  const text = String(value ?? "");
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

const isPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const toPreviewLabel = (value, fallback = "") => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (isPlainObject(value)) {
    const candidate =
      value.label ?? value.name ?? value.field ?? value.id ?? value.value;

    return candidate === undefined
      ? fallback
      : toPreviewLabel(candidate, fallback);
  }

  return fallback;
};

const resolveDialogueActionForPreview = ({
  actions,
  presentationState,
  props,
}) => {
  const authoredDialogue = isPlainObject(actions.dialogue)
    ? actions.dialogue
    : undefined;
  const presentationDialogue = isPlainObject(presentationState.dialogue)
    ? presentationState.dialogue
    : undefined;

  if (props.actionType === "presentation") {
    return presentationDialogue ?? authoredDialogue;
  }

  return authoredDialogue ?? presentationDialogue;
};

const findSectionReference = (sceneItems = {}, sectionId) => {
  if (typeof sectionId !== "string" || sectionId.length === 0) {
    return {};
  }

  for (const scene of Object.values(sceneItems)) {
    const section = scene?.sections?.items?.[sectionId];
    if (section) {
      return {
        scene,
        section,
      };
    }
  }

  return {};
};

const formatSectionReferenceLabel = ({ scene, section, sectionId } = {}) => {
  const sceneName = scene?.name ?? "";
  const sectionName = section?.name ?? sectionId ?? "";

  if (sceneName && sectionName) {
    return `${sceneName} - ${sectionName}`;
  }

  return sectionName || sceneName;
};

const countActions = (actions = {}) => {
  return actions && typeof actions === "object" && !Array.isArray(actions)
    ? Object.keys(actions).length
    : 0;
};

const isActionBranchDefault = (branch) => {
  return (
    branch &&
    typeof branch === "object" &&
    !Array.isArray(branch) &&
    !Object.hasOwn(branch, "when")
  );
};

const formatConditionalSummary = (branches = [], copy) => {
  const conditionalCount = branches.filter(
    (branch) => !isActionBranchDefault(branch),
  ).length;
  const hasDefault = branches.some((branch) => isActionBranchDefault(branch));
  const branchLabel =
    conditionalCount === 1
      ? localizeCommandLineText("1 branch", copy)
      : conditionalCount > 1
        ? formatCommandLineCopy(
            "{count} branches",
            { count: conditionalCount },
            copy,
          )
        : "";

  if (branchLabel && hasDefault) {
    return formatCommandLineCopy(
      "{branches} + default",
      { branches: branchLabel },
      copy,
    );
  }

  if (branchLabel) {
    return branchLabel;
  }

  return hasDefault
    ? localizeCommandLineText("default", copy)
    : localizeCommandLineText("0 branches", copy);
};

const isDisplayableScreenAction = (screenAction) => {
  return Boolean(
    screenAction?.animations?.resourceId ||
      screenAction?.opacity !== undefined ||
      Object.hasOwn(screenAction ?? {}, "blur"),
  );
};

// Moved from sceneEditor.store.js - now returns object instead of array
export const selectActionsData = ({ props, state, copy }) => {
  const actions = normalizeLineActions(props.actions || {});
  const presentationState =
    props.presentationState && typeof props.presentationState === "object"
      ? props.presentationState
      : {};

  const repositoryStateData = state.repositoryState || {};
  // Images, videos and sounds: accessed directly by ID (e.g., images[id])
  const images = repositoryStateData.images?.items || {};
  const videos = repositoryStateData.videos?.items || {};
  const sounds = repositoryStateData.sounds?.items || {};
  const voices = repositoryStateData.voices?.items || {};
  const files = repositoryStateData.files?.items || {};
  const animations = repositoryStateData.animations?.items || {};
  const colors = repositoryStateData.colors?.items || {};
  const scenes = repositoryStateData.scenes || {};
  // Layouts: need full tree structure for toFlatItems() to search through nested folders
  const layoutsHierarchy = repositoryStateData.layouts || {};
  const layoutsItems = layoutsHierarchy.items || {};
  const controlsItems = repositoryStateData.controls?.items || {};
  const sceneItems = scenes.items || {};

  const actionsObject = {};
  const preview = {};

  const backgroundAction = resolveBackgroundPreviewAction({
    actions,
    presentationState,
  });

  if (backgroundAction?.resourceId || backgroundAction?.colorId) {
    const backgroundImage = images[backgroundAction.resourceId];
    const backgroundVideo = videos[backgroundAction.resourceId];
    const backgroundLayout = layoutsItems[backgroundAction.resourceId];
    const colorPreview = buildColorPreview(colors, backgroundAction.colorId);
    actionsObject.background = backgroundAction;
    if (backgroundImage) {
      preview.background = {
        ...backgroundImage,
        ...colorPreview,
        type: "image",
      };
    } else if (backgroundVideo) {
      preview.background = {
        ...backgroundVideo,
        ...colorPreview,
        type: "video",
      };
    } else if (backgroundLayout) {
      preview.background = {
        ...backgroundLayout,
        ...colorPreview,
        type: "layout",
      };
    } else if (colorPreview) {
      preview.background = {
        ...colorPreview,
        name: colorPreview.colorName,
        type: "color",
      };
    }
  }

  if (isDisplayableScreenAction(actions.screen)) {
    const animationResourceId = actions.screen?.animations?.resourceId;
    const animation = animations[animationResourceId];
    actionsObject.screen = actions.screen;
    preview.screen = {
      animation,
      label:
        animation?.name ||
        animationResourceId ||
        localizeCommandLineText("Screen", copy),
    };
  }

  if (presentationState.layout) {
    actionsObject.layout = presentationState.layout;
    preview.layout = layoutsItems[presentationState.layout.resourceId];
  }

  if (presentationState.bgm) {
    actionsObject.bgm = presentationState.bgm;
    preview.bgm = sounds[presentationState.bgm.resourceId];
  }

  const voiceAction = isPlainObject(actions.voice)
    ? actions.voice
    : isPlainObject(presentationState.voice)
      ? presentationState.voice
      : undefined;
  if (voiceAction?.resourceId) {
    actionsObject.voice = voiceAction;
    preview.voice = voices[voiceAction.resourceId] ??
      sounds[voiceAction.resourceId] ??
      (files[voiceAction.resourceId]
        ? {
            id: voiceAction.resourceId,
            name: files[voiceAction.resourceId].name ?? voiceAction.resourceId,
            fileId: voiceAction.resourceId,
          }
        : undefined) ?? {
        id: voiceAction.resourceId,
        name: voiceAction.resourceId,
      };
  }

  // Sound Effects
  if (actions.sfx?.items) {
    const soundEffectsData = actions.sfx.items.map((sfx) => ({
      ...sfx,
      sound: sounds[sfx.resourceId],
    }));
    const names = soundEffectsData
      .map((sfx) => sfx.sound?.name || "")
      .filter((name) => name !== "")
      .join(", ");

    actionsObject.sfx = actions.sfx;
    preview.sfx = {
      names,
    };
  }

  if (presentationState.character?.items) {
    actionsObject.character = presentationState.character;
    preview.character = presentationState.character.items.map((char) => {
      const character = repositoryStateData.characters?.items?.[char.id];
      const spriteFileIds = buildCharacterSpritePreviewFileIds({
        spritesCollection: character?.sprites,
        spriteIds: Array.isArray(char.sprites)
          ? char.sprites.map((sprite) => sprite?.resourceId)
          : [],
      });
      const spritePreviewLayers = buildCharacterSpritePreviewLayers({
        spritesCollection: character?.sprites,
        spriteIds: Array.isArray(char.sprites)
          ? char.sprites.map((sprite) => sprite?.resourceId)
          : [],
      });

      if (spriteFileIds.length === 0 && character?.fileId) {
        spriteFileIds.push(character.fileId);
        spritePreviewLayers.push({
          kind: "image",
          fileId: character.fileId,
          previewKey: `image:${character.id ?? char.id}:${character.fileId}`,
        });
      }

      return {
        ...char,
        name: character?.name || "",
        spriteFileIds,
        spritePreviewLayers,
        spritePreviewBr: "none",
        hasSpritePreview: spritePreviewLayers.length > 0,
      };
    });
  }

  if (actions.sectionTransition) {
    actionsObject.sectionTransition = actions.sectionTransition;
    const scene = sceneItems[actions.sectionTransition.sceneId];
    const section =
      scene?.sections?.items?.[actions.sectionTransition.sectionId];
    if (scene) {
      const isCurrentScene =
        actions.sectionTransition.sceneId === props.currentSceneId;
      const sceneName =
        scene.name || localizeCommandLineText("Unknown Scene", copy);
      const sectionName =
        section?.name || localizeCommandLineText("Unknown Section", copy);

      preview.sectionTransition = {
        scene,
        section,
        label: isCurrentScene ? sectionName : `${sceneName} - ${sectionName}`,
      };
    }
  }

  if (actions.resetStoryAtSection) {
    actionsObject.resetStoryAtSection = actions.resetStoryAtSection;
    const sectionId = actions.resetStoryAtSection.sectionId;
    const { scene, section } = findSectionReference(sceneItems, sectionId);
    const targetLabel = formatSectionReferenceLabel({
      scene,
      section,
      sectionId,
    });

    preview.resetStoryAtSection = {
      scene,
      section,
      sectionId,
      label: targetLabel
        ? formatCommandLineCopy(
            "Reset story at {target}",
            { target: targetLabel },
            copy,
          )
        : localizeCommandLineText("Reset story at section", copy),
    };
  }

  if (actions.pushOverlay) {
    actionsObject.pushOverlay = actions.pushOverlay;
    const layout = layoutsItems[actions.pushOverlay.resourceId];
    if (layout) {
      preview.pushOverlay = {
        layout,
        summary: formatCommandLineCopy(
          "Push overlay: {layout}",
          { layout: layout.name },
          copy,
        ),
      };
    }
  }

  if (actions.popOverlay) {
    actionsObject.popOverlay = actions.popOverlay;
    preview.popOverlay = {
      summary: localizeCommandLineText("Pop current overlay", copy),
    };
  }

  if (actions.rollbackByOffset) {
    actionsObject.rollbackByOffset = actions.rollbackByOffset;
    const rawOffset = Number(actions.rollbackByOffset.offset);
    const offset = Number.isFinite(rawOffset) ? rawOffset : -1;
    preview.rollbackByOffset = {
      offset,
      summary:
        Math.abs(offset) === 1
          ? formatCommandLineCopy(
              "Rollback by {count} line",
              { count: Math.abs(offset) },
              copy,
            )
          : formatCommandLineCopy(
              "Rollback by {count} lines",
              { count: Math.abs(offset) },
              copy,
            ),
    };
  }

  if (actions.showConfirmDialog) {
    actionsObject.showConfirmDialog = actions.showConfirmDialog;
    const confirmActions =
      actions.showConfirmDialog.confirmActions &&
      typeof actions.showConfirmDialog.confirmActions === "object"
        ? actions.showConfirmDialog.confirmActions
        : {};
    const cancelActions =
      actions.showConfirmDialog.cancelActions &&
      typeof actions.showConfirmDialog.cancelActions === "object"
        ? actions.showConfirmDialog.cancelActions
        : {};

    preview.showConfirmDialog = {
      layout: layoutsItems[actions.showConfirmDialog.resourceId],
      resourceId: actions.showConfirmDialog.resourceId,
      layoutName:
        layoutsItems[actions.showConfirmDialog.resourceId]?.name ??
        actions.showConfirmDialog.resourceId ??
        localizeCommandLineText("No layout", copy),
      confirmActionCount: Object.keys(confirmActions).length,
      cancelActionCount: Object.keys(cancelActions).length,
    };
    preview.showConfirmDialog.title = formatCommandLineCopy(
      "Show confirm dialog: {layout}",
      { layout: preview.showConfirmDialog.layoutName },
      copy,
    );
    preview.showConfirmDialog.summary = formatCommandLineCopy(
      "Confirm: {confirmCount} action(s), Cancel: {cancelCount} action(s)",
      {
        confirmCount: preview.showConfirmDialog.confirmActionCount,
        cancelCount: preview.showConfirmDialog.cancelActionCount,
      },
      copy,
    );
  }

  if (actions.conditional) {
    actionsObject.conditional = actions.conditional;
    const branches = Array.isArray(actions.conditional.branches)
      ? actions.conditional.branches
      : [];
    const actionCount = branches.reduce(
      (total, branch) => total + countActions(branch?.actions),
      0,
    );

    preview.conditional = {
      branchCount: branches.length,
      actionCount,
      summary: formatConditionalSummary(branches, copy),
      actionsSummary:
        actionCount === 1
          ? formatCommandLineCopy(
              "{count} nested action",
              { count: actionCount },
              copy,
            )
          : formatCommandLineCopy(
              "{count} nested actions",
              { count: actionCount },
              copy,
            ),
    };
    preview.conditional.title = formatCommandLineCopy(
      "Conditional: {summary}",
      { summary: preview.conditional.summary },
      copy,
    );
  }

  if (actions.hideConfirmDialog !== undefined) {
    actionsObject.hideConfirmDialog = actions.hideConfirmDialog;
    preview.hideConfirmDialog = true;
  }

  if (actions.saveSlot) {
    actionsObject.saveSlot = actions.saveSlot;
    const rawSlotId =
      actions.saveSlot.slotId ??
      actions.saveSlot.slot ??
      actions.saveSlot.slotKey;
    const slotId =
      rawSlotId === undefined || rawSlotId === null || rawSlotId === ""
        ? undefined
        : String(rawSlotId);

    preview.saveSlot = {
      slotId,
      label: slotId ?? localizeCommandLineText("Auto", copy),
    };
    preview.saveSlot.summary = formatCommandLineCopy(
      "Save slot {slot}",
      { slot: preview.saveSlot.label },
      copy,
    );
  }

  if (actions.loadSlot) {
    actionsObject.loadSlot = actions.loadSlot;
    const rawSlotId =
      actions.loadSlot.slotId ??
      actions.loadSlot.slot ??
      actions.loadSlot.slotKey;
    const slotId =
      rawSlotId === undefined || rawSlotId === null || rawSlotId === ""
        ? undefined
        : String(rawSlotId);

    preview.loadSlot = {
      slotId,
      label: slotId ?? localizeCommandLineText("Auto", copy),
    };
    preview.loadSlot.summary = formatCommandLineCopy(
      "Load slot {slot}",
      { slot: preview.loadSlot.label },
      copy,
    );
  }

  const dialogueAction = resolveDialogueActionForPreview({
    actions,
    presentationState,
    props,
  });

  if (dialogueAction) {
    actionsObject.dialogue = dialogueAction;
    const authoredDialogue = isPlainObject(actions.dialogue)
      ? actions.dialogue
      : undefined;
    const dialogueModeLabel = resolveDialogueModeLabel(
      dialogueAction,
      layoutsItems,
    );
    const customCharacterNameLabel =
      dialogueAction.clear === true ||
      typeof dialogueAction.character?.name !== "string" ||
      dialogueAction.character.name.length === 0
        ? undefined
        : formatCommandLineCopy(
            "Name: {name}",
            { name: truncatePreviewText(dialogueAction.character.name) },
            copy,
          );
    const hasDialogueCharacter =
      !!dialogueAction.characterId || customCharacterNameLabel !== undefined;
    const persistCharacterLabel =
      dialogueAction.clear === true ||
      hasDialogueCharacter !== true ||
      dialogueAction.persistCharacter !== true
        ? undefined
        : localizeCommandLineText("Persist Speaker", copy);
    const spriteItems = Array.isArray(dialogueAction.character?.sprite?.items)
      ? dialogueAction.character.sprite.items
      : [];
    const spriteAnimationId =
      dialogueAction.character?.sprite?.animations?.resourceId;
    const spriteLabel =
      spriteItems.length > 0
        ? spriteItems.length === 1
          ? formatCommandLineCopy(
              "Sprite: {count} layer",
              { count: spriteItems.length },
              copy,
            )
          : formatCommandLineCopy(
              "Sprite: {count} layers",
              { count: spriteItems.length },
              copy,
            )
        : spriteAnimationId
          ? localizeCommandLineText("Sprite Animation", copy)
          : undefined;
    const appendLabel =
      authoredDialogue?.append === true || dialogueAction.append === true
        ? localizeCommandLineText("append", copy)
        : undefined;
    if (dialogueAction.clear === true) {
      preview.dialogue = {
        name: localizeCommandLineText("Dialogue: Clear", copy),
        modeLabel: dialogueModeLabel,
        customCharacterNameLabel,
        persistCharacterLabel,
        spriteLabel,
        appendLabel,
      };
    } else {
      preview.dialogue = {
        name:
          layoutsItems[
            dialogueAction.ui?.resourceId ?? dialogueAction.gui?.resourceId
          ]?.name || localizeCommandLineText("No layout", copy),
        modeLabel: dialogueModeLabel,
        customCharacterNameLabel,
        persistCharacterLabel,
        spriteLabel,
        appendLabel,
      };
    }
  }

  if (actions.choice) {
    actionsObject.choice = actions.choice;
    preview.choice = {
      layout: layoutsItems[actions.choice.layoutId],
      items: Array.isArray(actions.choice.items)
        ? actions.choice.items.map((item) => ({
            ...item,
            content: truncatePreviewText(item.content),
          }))
        : [],
    };
  }

  if (actions.form) {
    actionsObject.form = actions.form;
    const variableItems = repositoryStateData.variables?.items || {};
    const layout = layoutsItems[actions.form.resourceId];
    const inputFieldItems = getLayoutInputFieldItems({
      layout,
      layoutId: actions.form.resourceId,
      layoutsData: layoutsHierarchy,
    });
    const inputFieldsById = new Map(
      inputFieldItems.map((field) => [field.field, field]),
    );
    const fields =
      actions.form.fields &&
      typeof actions.form.fields === "object" &&
      !Array.isArray(actions.form.fields)
        ? actions.form.fields
        : {};
    const fieldItems = Object.entries(fields).map(([fieldId, field], index) => {
      const variableId = field?.variableId;
      const variable = variableItems[variableId];
      const inputField = inputFieldsById.get(fieldId) ?? inputFieldItems[index];
      const fieldLabel = toPreviewLabel(
        inputField?.label ?? inputField?.field ?? fieldId,
        fieldId,
      );
      const variableName = toPreviewLabel(
        variable?.name ?? variableId,
        localizeCommandLineText("No variable", copy),
      );

      return {
        field: fieldId,
        fieldLabel,
        variableId,
        variableName,
        summary: formatCommandLineCopy(
          "{field}: {variable}",
          {
            field: fieldLabel,
            variable: variableName,
          },
          copy,
        ),
      };
    });

    preview.form = {
      layout,
      layoutName:
        layout?.name ??
        actions.form.resourceId ??
        localizeCommandLineText("No layout", copy),
      fields: fieldItems,
      fieldCount: fieldItems.length,
      submitActionCount: countActions(actions.form.submitActions),
    };
  }

  if (presentationState.control) {
    actionsObject.control = presentationState.control;
    preview.control = controlsItems[presentationState.control.resourceId];
  }

  // Next Line
  if (actions.nextLine) {
    actionsObject.nextLine = actions.nextLine;
    preview.nextLine = actions.nextLine;
  }

  // Toggle Auto Mode
  if (actions.toggleAutoMode !== undefined) {
    actionsObject.toggleAutoMode = actions.toggleAutoMode;
    preview.toggleAutoMode = actions.toggleAutoMode;
  }

  // Toggle Skip Mode
  if (actions.toggleSkipMode !== undefined) {
    actionsObject.toggleSkipMode = actions.toggleSkipMode;
    preview.toggleSkipMode = actions.toggleSkipMode;
  }

  if (actions.startSkipMode !== undefined) {
    actionsObject.startSkipMode = actions.startSkipMode;
    preview.startSkipMode = actions.startSkipMode;
  }

  if (actions.stopSkipMode !== undefined) {
    actionsObject.stopSkipMode = actions.stopSkipMode;
    preview.stopSkipMode = actions.stopSkipMode;
  }

  if (actions.toggleDialogueUI !== undefined) {
    actionsObject.toggleDialogueUI = actions.toggleDialogueUI;
    preview.toggleDialogueUI = actions.toggleDialogueUI;
  }

  const runtimePreviewItems = [];
  for (const mode of getRuntimeActionModes()) {
    if (actions[mode] === undefined) {
      continue;
    }

    actionsObject[mode] = actions[mode];
    const runtimePreview = createRuntimeActionPreview(mode, actions[mode]);
    if (!runtimePreview) {
      continue;
    }

    preview[mode] = runtimePreview;
    runtimePreviewItems.push(runtimePreview);
  }

  if (runtimePreviewItems.length > 0) {
    preview.runtimeActions = runtimePreviewItems;
  }

  // Visual
  if (presentationState.visual?.items) {
    actionsObject.visual = presentationState.visual;
    preview.visual = {
      count: presentationState.visual.items.length,
      items: presentationState.visual.items.map((item) => {
        const imageData = images[item.resourceId];
        const videoData = videos[item.resourceId];
        const layoutData = layoutsItems[item.resourceId];
        const resource = imageData || videoData || layoutData;
        return {
          ...item,
          resource,
          previewFileId: resource?.thumbnailFileId || resource?.fileId,
          resourceType: imageData ? "image" : videoData ? "video" : "layout",
        };
      }),
    };
  }

  // Set Next Line Config
  if (actions.setNextLineConfig) {
    actionsObject.setNextLineConfig = actions.setNextLineConfig;
    preview.setNextLineConfig = actions.setNextLineConfig;
  }

  // Update Variable
  if (actions.updateVariable) {
    actionsObject.updateVariable = actions.updateVariable;
    const variableItems = repositoryStateData.variables?.items || {};
    const operations = Array.isArray(actions.updateVariable.operations)
      ? actions.updateVariable.operations
      : [];

    const summary =
      operations
        .map((op) => {
          const variable = variableItems[op.variableId];
          const varName = variable?.name || op.variableId;
          if (op.op === "toggle") {
            return formatCommandLineCopy(
              "{variable} toggle",
              { variable: varName },
              copy,
            );
          } else if (op.op === "set") {
            return `${varName} = ${op.value}`;
          } else if (op.op === "increment") {
            return `${varName} +${op.value ?? 1}`;
          } else if (op.op === "decrement") {
            return `${varName} -${op.value ?? 1}`;
          } else if (op.op === "multiply") {
            return `${varName} *${op.value}`;
          } else if (op.op === "divide") {
            return `${varName} /${op.value}`;
          }
          return `${varName} ${op.op}`;
        })
        .join(", ") || localizeCommandLineText("No operations", copy);

    preview.updateVariable = {
      summary,
      operationCount: operations.length,
    };
  }

  return {
    actions: actionsObject,
    preview,
  };
};

export const showDropdownMenu = ({ state }, { position, actionType } = {}) => {
  state.dropdownMenu = {
    ...state.dropdownMenu,
    isOpen: true,
    position,
    actionType,
  };
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.actionType = null;
};

export const selectDropdownMenuActionType = ({ state }) => {
  return state.dropdownMenu.actionType;
};

export const deleteAction = ({ state }, { _actionType } = {}) => {
  hideDropdownMenu(state);
};
