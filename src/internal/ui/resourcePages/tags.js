import { generateId } from "../../id.js";
import {
  appendTagToCollection,
  buildTagFilterOptions,
  buildUniqueTagIds,
  createEmptyTagCollection,
  getTagsCollection,
  matchesTagFilter,
  resolveCollectionWithTags,
} from "../../resourceTags.js";
import { runResourcePageMutation } from "./resourcePageErrors.js";

export const CREATE_TAG_DEFAULT_VALUES = Object.freeze({
  name: "",
});

export const createTagForm = ({
  title = "Create Tag",
  submitLabel = "Create Tag",
} = {}) => ({
  title,
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Tag Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: submitLabel,
      },
    ],
  },
});

export const createTagField = ({
  name = "tagIds",
  label = "Tags",
  placeholder = "Select tags",
  addOptionLabel = "Add tag",
} = {}) => ({
  name,
  type: "tag-select",
  label,
  placeholder,
  addOption: {
    label: addOptionLabel,
  },
  required: false,
});

export const createTagState = ({
  createEmptyTagsCollection = createEmptyTagCollection,
} = {}) => ({
  tagsData: createEmptyTagsCollection(),
  activeTagIds: [],
  detailTagIds: [],
  detailTagIdsDirty: false,
  isDetailTagSelectOpen: false,
  isCreateTagDialogOpen: false,
  createTagDefaultValues: {
    ...CREATE_TAG_DEFAULT_VALUES,
  },
  createTagContext: {
    mode: undefined,
    itemId: undefined,
    draftTagIds: [],
  },
});

export const syncDetailTagIds = ({
  state,
  item,
  preserveDirty = false,
} = {}) => {
  if (!state) {
    return;
  }

  if (preserveDirty && state.detailTagIdsDirty) {
    return;
  }

  state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
  state.detailTagIdsDirty = false;
};

export const setTagsDataState = ({
  state,
  tagsData,
  createEmptyTagsCollection = createEmptyTagCollection,
} = {}) => {
  state.tagsData = tagsData ?? createEmptyTagsCollection();
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.activeTagIds = (state.activeTagIds ?? []).filter((tagId) =>
    validTagIds.has(tagId),
  );
  state.detailTagIds = (state.detailTagIds ?? []).filter((tagId) =>
    validTagIds.has(tagId),
  );
};

export const setActiveTagIdsState = ({ state, tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData?.items ?? {}));
  state.activeTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
};

export const setDetailTagIdsState = ({ state, tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData?.items ?? {}));
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = true;
};

export const commitDetailTagIdsState = ({ state, tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData?.items ?? {}));
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = false;
};

export const setDetailTagPopoverOpenState = ({
  state,
  open,
  item,
} = {}) => {
  state.isDetailTagSelectOpen = !!open;

  if (!state.isDetailTagSelectOpen && state.detailTagIdsDirty) {
    syncDetailTagIds({
      state,
      item,
    });
  }
};

export const openCreateTagDialogState = ({
  state,
  mode,
  itemId,
  draftTagIds,
} = {}) => {
  state.isCreateTagDialogOpen = true;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: mode ?? "item",
    itemId,
    draftTagIds: Array.isArray(draftTagIds) ? [...draftTagIds] : [],
  };
};

export const closeCreateTagDialogState = ({ state } = {}) => {
  state.isCreateTagDialogOpen = false;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: undefined,
    itemId: undefined,
    draftTagIds: [],
  };
};

export const filterGroupsByActiveTags = ({
  groups,
  itemsById,
  activeTagIds = [],
} = {}) => {
  const normalizedGroups = Array.isArray(groups) ? groups : [];
  const normalizedActiveTagIds = Array.isArray(activeTagIds)
    ? activeTagIds
    : [];

  return normalizedGroups
    .map((group) => ({
      ...group,
      children: (group.children ?? []).filter((child) =>
        matchesTagFilter({
          item: itemsById?.[child.id],
          activeTagIds: normalizedActiveTagIds,
        }),
      ),
    }))
    .filter(
      (group) =>
        group.children.length > 0 || normalizedActiveTagIds.length === 0,
    );
};

export const buildTagViewData = ({
  state,
  selectedItem,
  createTagFormDefinition,
  tagFilterPlaceholder = "Filter tags",
  detailTagAddOptionLabel = "Add tag",
} = {}) => ({
  tagFilterOptions: buildTagFilterOptions({
    tagsCollection: state.tagsData,
  }),
  selectedTagFilterValues: state.activeTagIds ?? [],
  tagFilterPlaceholder,
  selectedItemTagIds: selectedItem?.tagIds ?? [],
  detailTagDraftValues: state.detailTagIds ?? [],
  isDetailTagSelectOpen: !!state.isDetailTagSelectOpen,
  detailTagAddOption: {
    label: detailTagAddOptionLabel,
  },
  isCreateTagDialogOpen: state.isCreateTagDialogOpen,
  createTagDefaultValues: state.createTagDefaultValues,
  createTagForm: createTagFormDefinition,
});

export const resolveTaggedCollectionData = ({
  repositoryState,
  collection,
  scopeKey,
  itemType,
} = {}) => {
  const tagsData = getTagsCollection(repositoryState, scopeKey);

  return {
    tagsData,
    data: resolveCollectionWithTags({
      collection,
      tagsCollection: tagsData,
      itemType,
    }),
  };
};

export const syncTaggedCollectionToStore = ({
  store,
  repositoryState,
  collection,
  scopeKey,
  itemType,
} = {}) => {
  const { data, tagsData } = resolveTaggedCollectionData({
    repositoryState,
    collection,
    scopeKey,
    itemType,
  });

  store.setTagsData({ tagsData });
  store.setItems({ data });
};

export const appendTagIdToForm = ({ form, tagId } = {}) => {
  const currentValues = form?.getValues?.() ?? {};
  form?.setValues?.({
    values: {
      ...currentValues,
      tagIds: buildUniqueTagIds(currentValues.tagIds ?? [], [tagId]),
    },
  });
};

export const readTagIdsFromEvent = (payload) => {
  const detail = payload?._event?.detail ?? {};
  if (Array.isArray(detail.tagIds)) {
    return detail.tagIds;
  }

  if (Array.isArray(detail.value)) {
    return detail.value;
  }

  return [];
};

const runAfterNextFrame = (callback) => {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => {
      callback();
    });
    return;
  }

  callback();
};

export const createResourcePageTagHandlers = ({
  resolveScopeKey,
  updateItemTagIds,
  refreshAfterItemTagUpdate,
  getSelectedItemId = ({ deps }) => deps.store.selectSelectedItemId(),
  getSelectedItemTagIds = ({ deps }) =>
    deps.store.selectSelectedItem?.()?.tagIds ?? [],
  appendCreatedTagByMode,
  createTagFallbackMessage = "Failed to create tag.",
  updateItemTagFallbackMessage = "Failed to update tags.",
} = {}) => {
  const reopenDetailTagPopover = ({ deps, itemId } = {}) => {
    if (!itemId || itemId !== getSelectedItemId({ deps })) {
      return;
    }

    const { render, store } = deps;
    store.setDetailTagPopoverOpen({
      open: true,
    });
    render();
  };

  const openCreateTagDialogForMode = ({ deps, mode, itemId } = {}) => {
    const { render, store } = deps;
    const resolvedItemId = itemId ?? getSelectedItemId({ deps });
    const draftTagIds =
      mode === "item"
        ? buildUniqueTagIds(
            store.getState().detailTagIds ??
              getSelectedItemTagIds({
                deps,
                itemId: resolvedItemId,
              }),
          )
        : [];

    if (mode === "item" && resolvedItemId) {
      store.setDetailTagPopoverOpen({
        open: false,
        item: {
          tagIds: getSelectedItemTagIds({
            deps,
            itemId: resolvedItemId,
          }),
        },
      });
      render();
      runAfterNextFrame(() => {
        store.openCreateTagDialog({
          mode,
          itemId: resolvedItemId,
          draftTagIds,
        });
        render();
      });
      return;
    }

    store.openCreateTagDialog({
      mode,
      itemId: resolvedItemId,
      draftTagIds,
    });
    render();
  };

  const handleCreateTagDialogClose = (deps) => {
    const { render, store } = deps;
    const { mode, itemId, draftTagIds } = store.getState().createTagContext ?? {};
    store.closeCreateTagDialog();

    if (mode === "item" && itemId && itemId === getSelectedItemId({ deps })) {
      store.setDetailTagIds({
        tagIds: draftTagIds ?? [],
      });
    }

    render();

    if (mode === "item" && itemId) {
      runAfterNextFrame(() => {
        reopenDetailTagPopover({
          deps,
          itemId,
        });
      });
    }
  };

  const handleTagFilterChange = (deps, payload) => {
    const { render, store } = deps;
    store.setActiveTagIds({
      tagIds: readTagIdsFromEvent(payload),
    });
    render();
  };

  const handleTagFilterAddOptionClick = (deps) => {
    openCreateTagDialogForMode({
      deps,
      mode: "filter",
    });
  };

  const handleDetailTagAddOptionClick = (deps) => {
    const itemId = getSelectedItemId({ deps });
    if (!itemId) {
      return;
    }

    openCreateTagDialogForMode({
      deps,
      mode: "item",
      itemId,
    });
  };

  const handleDetailTagValueChange = async (deps, payload) => {
    const { appService, store } = deps;
    const itemId = getSelectedItemId({ deps });
    if (!itemId) {
      return;
    }

    const tagIds = readTagIdsFromEvent(payload);
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage:
        typeof updateItemTagFallbackMessage === "function"
          ? updateItemTagFallbackMessage({ deps, itemId, tagIds })
          : updateItemTagFallbackMessage,
      action: () =>
        updateItemTagIds({
          deps,
          itemId,
          tagIds,
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }

    store.commitDetailTagIds({ tagIds });
    if (typeof refreshAfterItemTagUpdate === "function") {
      await refreshAfterItemTagUpdate({
        deps,
        itemId,
        tagIds,
      });
      return;
    }

    deps.render();
  };

  const handleDetailTagDraftValueChange = (deps, payload) => {
    const { render, store } = deps;
    store.setDetailTagIds({
      tagIds: readTagIdsFromEvent(payload),
    });
    render();
  };

  const handleDetailTagOpenChange = (deps, payload) => {
    const { render, store } = deps;
    const detail = payload?._event?.detail ?? {};
    const selectedItemId = getSelectedItemId({ deps });
    store.setDetailTagPopoverOpen({
      open: !!detail.open,
      item: selectedItemId
        ? {
            tagIds: getSelectedItemTagIds({
              deps,
              itemId: selectedItemId,
            }),
          }
        : undefined,
    });
    render();
  };

  const handleCreateTagFormAction = async (deps, payload) => {
    const { appService, projectService, render, store } = deps;
    const { actionId, values } = payload._event.detail;
    if (actionId !== "submit") {
      return;
    }

    const name = values?.name?.trim();
    if (!name) {
      appService.showAlert({
        message: "Tag name is required.",
        title: "Warning",
      });
      return;
    }

    const { mode, itemId, draftTagIds } = store.getState().createTagContext ?? {};
    const scopeKey = resolveScopeKey({
      deps,
      itemId,
      mode,
    });
    const tagId = generateId();
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage:
        typeof createTagFallbackMessage === "function"
          ? createTagFallbackMessage({ deps, itemId, mode })
          : createTagFallbackMessage,
      action: () =>
        projectService.createTag({
          scopeKey,
          tagId,
          data: {
            type: "tag",
            name,
          },
        }),
    });

    if (!createAttempt.ok) {
      return;
    }

    store.closeCreateTagDialog();
    store.setTagsData({
      tagsData: appendTagToCollection({
        tagsCollection: store.getState().tagsData,
        tag: {
          id: tagId,
          type: "tag",
          name,
        },
      }),
    });

    if (mode === "filter") {
      store.setActiveTagIds({
        tagIds: buildUniqueTagIds(store.getState().activeTagIds, [tagId]),
      });
    }

    if (mode === "item" && itemId) {
      store.setDetailTagIds({
        tagIds: buildUniqueTagIds(draftTagIds, [tagId]),
      });
    }

    render();

    if (mode === "item" && itemId) {
      runAfterNextFrame(() => {
        reopenDetailTagPopover({
          deps,
          itemId,
        });
      });
    }

    appendCreatedTagByMode?.({
      deps,
      itemId,
      mode,
      tagId,
    });
  };

  return {
    openCreateTagDialogForMode,
    handleCreateTagDialogClose,
    handleTagFilterChange,
    handleTagFilterAddOptionClick,
    handleDetailTagAddOptionClick,
    handleDetailTagDraftValueChange,
    handleDetailTagOpenChange,
    handleDetailTagValueChange,
    handleCreateTagFormAction,
  };
};
