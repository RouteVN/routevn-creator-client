import { nanoid } from "nanoid";

const lodashGet = (obj, path, defaultValue) => {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return defaultValue;
    }
  }
  return current !== undefined ? current : defaultValue;
};

// Forward click-item event from base component
export const handleClickItem = async (deps, payload) => {
  const { dispatchEvent, repositoryFactory, router, props } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { id } = payload._event.detail;

  // Get the clicked item from the repository based on repositoryTarget
  const repositoryTarget = props.repositoryTarget;
  if (!repositoryTarget) {
    throw new Error(
      "🔧 REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component",
    );
  }

  const repositoryState = repository.getState();
  const targetData = lodashGet(repositoryState, repositoryTarget);
  const selectedItem =
    targetData && targetData.items ? targetData.items[id] : null;

  // Forward the event with enhanced detail containing item data
  dispatchEvent(
    new CustomEvent("click-item", {
      detail: {
        ...payload._event.detail,
        item: selectedItem,
        repositoryTarget,
        isFolder: selectedItem && selectedItem.type === "folder",
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDblClickItem = (deps, payload) => {
  const { dispatchEvent } = deps;
  // Just forward the event
  dispatchEvent(
    new CustomEvent("dblclick-item", {
      detail: payload._event.detail,
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePageItemClick = (deps, payload) => {
  const { getRefIds } = deps;
  const { "base-file-explorer": baseFileExplorer } = getRefIds();
  baseFileExplorer.elm.transformedHandlers.handlePageItemClick(payload);
};

export const handleFileAction = async (deps, payload) => {
  const { dispatchEvent, repositoryFactory, router, props } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const detail = payload._event.detail;
  const repositoryTarget = props.repositoryTarget;

  if (!repositoryTarget) {
    throw new Error(
      "🔧 REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component",
    );
  }

  // Extract the actual item from the detail (rtgl-dropdown-menu adds index)
  const item = detail.item || detail;
  const itemId = detail.itemId;

  console.log("item", item);

  if (item.value === "new-item") {
    repository.addAction({
      actionType: "treePush",
      target: repositoryTarget,
      value: {
        parent: "_root",
        position: "last",
        item: {
          id: nanoid(),
          type: "folder",
          name: "New Folder",
        },
      },
    });
  } else if (item.value === "add-container") {
    repository.addAction({
      actionType: "treePush",
      target: repositoryTarget,
      value: {
        parent: "_root",
        position: "last",
        item: {
          id: nanoid(),
          type: "container",
          name: "Container",
        },
      },
    });
  } else if (item.value === "add-sprite") {
    repository.addAction({
      actionType: "treePush",
      target: repositoryTarget,
      value: {
        parent: "_root",
        position: "last",
        item: {
          id: nanoid(),
          type: "sprite",
          name: "Sprite",
        },
      },
    });
  } else if (item.value === "add-text") {
    repository.addAction({
      actionType: "treePush",
      target: repositoryTarget,
      value: {
        parent: "_root",
        position: "last",
        item: {
          id: nanoid(),
          type: "text",
          name: "Text",
        },
      },
    });
  } else if (item.value === "rename-item-confirmed") {
    // Handle rename confirmation from popover form
    if (itemId && detail.newName) {
      repository.addAction({
        actionType: "treeUpdate",
        target: repositoryTarget,
        value: {
          id: itemId,
          replace: false,
          item: {
            name: detail.newName,
          },
        },
      });
    }
  } else if (item.value === "delete-item") {
    const repositoryState = repository.getState();
    const targetData = lodashGet(repositoryState, repositoryTarget);
    const currentItem =
      targetData && targetData.items ? targetData.items[itemId] : null;

    if (currentItem) {
      repository.addAction({
        actionType: "treeDelete",
        target: repositoryTarget,
        value: {
          id: itemId,
        },
      });
    }
  } else if (item.value === "new-child-folder") {
    const repositoryState = repository.getState();
    const targetData = lodashGet(repositoryState, repositoryTarget);
    const currentItem =
      targetData && targetData.items ? targetData.items[itemId] : null;
    if (currentItem) {
      repository.addAction({
        actionType: "treePush",
        target: repositoryTarget,
        value: {
          parent: itemId,
          position: "last",
          item: {
            id: nanoid(),
            type: "folder",
            name: "New Folder",
          },
        },
      });
    }
  } else if (item.value.action === "new-child-item") {
    const { ...restItem } = item.value;
    repository.addAction({
      actionType: "treePush",
      target: repositoryTarget,
      value: {
        parent: itemId || "_root",
        position: "last",
        item: {
          ...restItem,
          id: nanoid(),
        },
      },
    });
  } else if (item.value === "duplicate-item") {
    const repositoryState = repository.getState();
    const targetData = lodashGet(repositoryState, repositoryTarget);
    const currentItem =
      targetData && targetData.items ? targetData.items[itemId] : null;

    if (!currentItem) {
      return;
    }

    // Add the duplicated item with random number as seed
    repository.addAction({
      actionType: "treeCopy",
      target: repositoryTarget,
      value: {
        id: itemId,
        seed: Math.floor(Math.random() * 0x7fffffff), // Max 31-bit integer
      },
    });
  }

  // Emit data-changed event after any repository action
  dispatchEvent(
    new CustomEvent("data-changed", {
      detail: { target: repositoryTarget },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleTargetChanged = async (deps, payload) => {
  const { dispatchEvent, repositoryFactory, router, props } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const repositoryTarget = props.repositoryTarget;

  if (!repositoryTarget) {
    throw new Error(
      "🔧 REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component",
    );
  }

  const { target, source, position } = payload._event.detail;

  if (!source || !source.id) {
    console.warn("No source item provided");
    return;
  }

  let repositoryPosition;
  let parent;

  if (position === "inside") {
    // Drop inside a folder
    if (!target || target.type !== "folder") {
      console.warn("Cannot drop inside non-folder item");
      return;
    }
    parent = target.id;
    repositoryPosition = "last"; // Add to end of folder
  } else if (position === "above") {
    // Drop above target item
    if (!target || !target.id) {
      console.warn("No target item for above position");
      return;
    }
    parent = target.parentId || "_root";
    repositoryPosition = { before: target.id };
  } else if (position === "below") {
    // Drop below target item
    if (!target || !target.id) {
      console.warn("No target item for below position");
      return;
    }
    parent = target.parentId || "_root";
    repositoryPosition = { after: target.id };
  } else {
    console.warn("Unknown drop position:", position);
    return;
  }

  repository.addAction({
    actionType: "treeMove",
    target: repositoryTarget,
    value: {
      id: source.id,
      parent: parent,
      position: repositoryPosition,
    },
  });

  // Emit data-changed event after repository action
  dispatchEvent(
    new CustomEvent("data-changed", {
      detail: { target: repositoryTarget },
      bubbles: true,
      composed: true,
    }),
  );
};
