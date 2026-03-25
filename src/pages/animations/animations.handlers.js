import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { resetState } from "./animations.constants";

const defaultInitialValues = {
  x: 960,
  y: 540,
  alpha: 1,
  scaleX: 1,
  scaleY: 1,
  translateX: 0,
  translateY: 0,
};

const normalizeTween = (properties = {}) => {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([, config]) => (config?.keyframes ?? []).length > 0)
      .map(([property, config]) => {
        const normalizedConfig = {
          keyframes: (config?.keyframes ?? []).map((keyframe) => ({
            duration: Number(keyframe.duration) || 0,
            value: Number(keyframe.value) || 0,
            easing: keyframe.easing ?? "linear",
            relative: keyframe.relative ?? false,
          })),
        };

        if (config?.initialValue !== undefined && config.initialValue !== "") {
          normalizedConfig.initialValue = Number(config.initialValue) || 0;
        }

        return [property, normalizedConfig];
      }),
  );
};

const openAnimationDialog = async ({
  deps,
  editMode = false,
  itemId,
  itemData,
  targetGroupId,
  dialogType,
} = {}) => {
  const { graphicsService, refs, render, store } = deps;
  const resolvedDialogType =
    dialogType ??
    (itemData?.animation?.type === "transition" ? "transition" : "update");

  store.openDialog({
    editMode,
    itemId,
    itemData,
    targetGroupId,
    dialogType: resolvedDialogType,
  });
  render();

  if (editMode && itemData) {
    refs.animationForm.reset();
    refs.animationForm.setValues({
      values: {
        name: itemData.name ?? "",
      },
    });
  }

  if (resolvedDialogType !== "update") {
    return;
  }

  const { canvas } = refs;
  if (!canvas || !graphicsService) {
    return;
  }

  await graphicsService.init({ canvas });
  graphicsService.render(resetState);
};

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleAnimationItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "animations",
});

export {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleAnimationItemClick,
  handleSearchInput,
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { render, store } = deps;
  const { groupId, x, y } = payload._event.detail;

  store.openCreateTypeMenu({
    x,
    y,
    targetGroupId: groupId,
  });
  render();
};

export const handleAnimationItemDoubleClick = async (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  const itemData = deps.store.selectAnimationDisplayItemById({ itemId });
  if (!itemData) {
    return;
  }

  await openAnimationDialog({
    deps,
    editMode: true,
    itemId,
    itemData,
  });
};

export const handleCloseDialog = (deps) => {
  const { render, store } = deps;
  store.closeDialog();
  render();
};

export const handleCloseCreateTypeMenu = (deps) => {
  const { render, store } = deps;
  store.closeCreateTypeMenu();
  render();
};

export const handleCreateTypeMenuItemClick = async (deps, payload) => {
  const { render, store } = deps;
  const type = payload._event.detail.item?.value;
  const targetGroupId = store.selectCreateTypeMenuTargetGroupId();

  store.closeCreateTypeMenu();
  render();

  if (type !== "update" && type !== "transition") {
    return;
  }

  await openAnimationDialog({
    deps,
    targetGroupId,
    dialogType: type,
  });
};

export const handleClosePopover = (deps) => {
  const { render, store } = deps;
  store.closePopover();
  render();
};

export const handleFormActionClick = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Animation name is required.", { title: "Warning" });
    return;
  }

  const dialogType = store.selectDialogType();
  const editMode = store.selectEditMode();
  const editItemId = store.selectEditItemId();
  let animationData;

  if (dialogType === "transition") {
    const prevTween = normalizeTween(store.selectProperties({ side: "prev" }));
    const nextTween = normalizeTween(store.selectProperties({ side: "next" }));
    const hasPrev = Object.keys(prevTween).length > 0;
    const hasNext = Object.keys(nextTween).length > 0;

    if (!hasPrev && !hasNext) {
      appService.showToast("Add at least one property to Previous or Next.", {
        title: "Warning",
      });
      return;
    }

    animationData = {
      type: "transition",
    };

    if (hasPrev) {
      animationData.prev = {
        tween: prevTween,
      };
    }

    if (hasNext) {
      animationData.next = {
        tween: nextTween,
      };
    }
  } else {
    const tween = normalizeTween(store.selectProperties({ side: "update" }));

    if (Object.keys(tween).length === 0) {
      appService.showToast("Add at least one animation property.", {
        title: "Warning",
      });
      return;
    }

    animationData = {
      type: "update",
      tween,
    };
  }

  if (editMode && editItemId) {
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update animation.",
      action: () =>
        projectService.updateAnimation({
          animationId: editItemId,
          data: {
            name,
            animation: animationData,
          },
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }
  } else {
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create animation.",
      action: () =>
        projectService.createAnimation({
          animationId: nanoid(),
          data: {
            type: "animation",
            name,
            animation: animationData,
          },
          parentId: store.selectTargetGroupId(),
          position: "last",
        }),
    });

    if (!createAttempt.ok) {
      return;
    }
  }

  store.closeDialog();
  await handleDataChanged(deps);
};

export const handleAddPropertiesClick = (deps, payload) => {
  const { render, store } = deps;
  const side =
    payload._event.currentTarget?.dataset?.side ??
    (store.selectDialogType() === "transition" ? "prev" : "update");

  store.setPopover({
    mode: "addProperty",
    x: payload._event.clientX,
    y: payload._event.clientY,
    payload: {
      side,
    },
  });
  render();
};

export const handleAddPropertyFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { side },
  } = store.selectPopover();
  const { property, initialValue, useInitialValue } =
    payload._event.detail.values;

  const finalInitialValue = useInitialValue
    ? initialValue !== undefined
      ? initialValue
      : (defaultInitialValues[property] ?? 0)
    : (defaultInitialValues[property] ?? 0);

  store.addProperty({
    side,
    property,
    initialValue: finalInitialValue,
  });
  store.closePopover();
  render();
};

export const handleAddKeyframeInDialog = (deps, payload) => {
  const { render, store } = deps;
  const side =
    payload._event.detail.side ??
    (store.selectDialogType() === "transition" ? "prev" : "update");

  store.setPopover({
    mode: "addKeyframe",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side,
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handleAddKeyframeFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { side, property, index },
  } = store.selectPopover();

  const formValues = {
    ...payload._event.detail.values,
  };

  if (formValues.duration < 1) {
    formValues.duration = 1;
  }

  store.addKeyframe({
    ...formValues,
    side,
    property,
    index,
  });
  store.closePopover();
  render();
};

export const handleKeyframeRightClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "keyframeMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side: payload._event.detail.side,
      property: payload._event.detail.property,
      index: payload._event.detail.index,
    },
  });
  render();
};

export const handlePropertyNameRightClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "propertyNameMenu",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side: payload._event.detail.side,
      property: payload._event.detail.property,
    },
  });
  render();
};

export const handleKeyframeDropdownItemClick = (deps, payload) => {
  const { render, store } = deps;
  const popover = store.selectPopover();
  const { side, property, index } = popover.payload;
  const { x, y } = popover;
  const value = payload._event.detail.item.value;

  if (value === "edit") {
    store.setPopover({
      mode: "editKeyframe",
      x,
      y,
      payload: {
        side,
        property,
        index,
      },
    });
  } else if (value === "delete-property") {
    store.deleteProperty({ side, property });
    store.closePopover();
  } else if (value === "delete-keyframe") {
    store.deleteKeyframe({ side, property, index });
    store.closePopover();
  } else if (value === "add-right") {
    store.setPopover({
      mode: "addKeyframe",
      x,
      y,
      payload: {
        side,
        property,
        index: Number(index) + 1,
      },
    });
  } else if (value === "add-left") {
    store.setPopover({
      mode: "addKeyframe",
      x,
      y,
      payload: {
        side,
        property,
        index,
      },
    });
  } else if (value === "move-right") {
    store.moveKeyframeRight({ side, property, index });
    store.closePopover();
  } else if (value === "move-left") {
    store.moveKeyframeLeft({ side, property, index });
    store.closePopover();
  }

  render();
};

export const handleEditKeyframeFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { side, property, index },
  } = store.selectPopover();

  const formValues = {
    ...payload._event.detail.values,
  };

  if (formValues.duration < 1) {
    formValues.duration = 1;
  }

  store.updateKeyframe({
    keyframe: formValues,
    side,
    index,
    property,
  });
  store.closePopover();
  render();
};

export const handleInitialValueClick = (deps, payload) => {
  const { render, store } = deps;
  store.setPopover({
    mode: "editInitialValue",
    x: payload._event.detail.x,
    y: payload._event.detail.y,
    payload: {
      side: payload._event.detail.side,
      property: payload._event.detail.property,
    },
  });
  render();
};

const updatePopoverFieldValue = ({ store, detail } = {}) => {
  const { name, value } = detail;
  const currentFormValues = store.selectPopover().formValues ?? {};
  store.updatePopoverFormValues({
    formValues: {
      ...currentFormValues,
      [name]: value,
    },
  });
};

export const handleAddPropertyFormChange = (deps, payload) => {
  const { render, store } = deps;
  updatePopoverFieldValue({
    store,
    detail: payload._event.detail,
  });
  render();
};

export const handleEditInitialValueFormChange = (deps, payload) => {
  const { render, store } = deps;
  updatePopoverFieldValue({
    store,
    detail: payload._event.detail,
  });
  render();
};

export const handleReplayAnimation = async (deps) => {
  const { graphicsService, store } = deps;
  if (!graphicsService || store.selectDialogType() !== "update") {
    return;
  }

  await graphicsService.render(resetState);

  setTimeout(() => {
    graphicsService.render(store.selectAnimationRenderStateWithAnimations());
  }, 100);
};

export const handleEditInitialValueFormSubmit = (deps, payload) => {
  const { render, store } = deps;
  const {
    payload: { side, property },
  } = store.selectPopover();

  const { initialValue, valueSource } = payload._event.detail.values;
  const finalInitialValue =
    valueSource === "default" || initialValue === undefined
      ? (defaultInitialValues[property] ?? 0)
      : initialValue;

  store.updateInitialValue({
    side,
    property,
    initialValue: finalInitialValue,
  });
  store.closePopover();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    return;
  }

  await projectService.deleteAnimations({
    animationIds: [itemId],
  });

  await handleDataChanged(deps);
};
