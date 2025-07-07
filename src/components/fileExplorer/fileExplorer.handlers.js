import { nanoid } from "nanoid";

// Forward click-item event from base component
export const handleClickItem = (e, deps) => {
  const { dispatchEvent } = deps;
  // Just forward the event
  dispatchEvent(new CustomEvent("click-item", {
    detail: e.detail,
    bubbles: true,
    composed: true
  }));
};

export const handleUpdateItemProperty = (e, deps) => {
  const { dispatchEvent, repository, props } = deps;
  const detail = e.detail;
  const repositoryTarget = props.repositoryTarget;
  
  if (!repositoryTarget) {
    throw new Error("🔧 REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component");
  }
  
  // Extract the actual item from the detail (rtgl-dropdown-menu adds index)
  const item = detail.item || detail;
  const itemId = detail.itemId;

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
    const targetData = repositoryState[repositoryTarget];
    const currentItem = targetData && targetData.items ? targetData.items[itemId] : null;

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
    const targetData = repositoryState[repositoryTarget];
    const currentItem = targetData && targetData.items ? targetData.items[itemId] : null;

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
  }

  // Emit data-changed event after any repository action
  dispatchEvent(new CustomEvent("data-changed", {
    detail: { target: repositoryTarget },
    bubbles: true,
    composed: true
  }));
};

export const handleTargetChanged = (e, deps) => {
  const { dispatchEvent, repository, props } = deps;
  const repositoryTarget = props.repositoryTarget;
  
  if (!repositoryTarget) {
    throw new Error("🔧 REQUIRED: repositoryTarget prop is missing! Please pass .repositoryTarget=targetName to fileExplorer component");
  }
  
  const { target, source, position } = e.detail;
  
  if (!source || !source.id) {
    console.warn("No source item provided");
    return;
  }

  let repositoryPosition;
  let parent;

  if (position === 'inside') {
    // Drop inside a folder
    if (!target || target.type !== 'folder') {
      console.warn("Cannot drop inside non-folder item");
      return;
    }
    parent = target.id;
    repositoryPosition = 'last'; // Add to end of folder
  } else if (position === 'above') {
    // Drop above target item
    if (!target || !target.id) {
      console.warn("No target item for above position");
      return;
    }
    parent = target.parentId || "_root";
    repositoryPosition = { before: target.id };
  } else if (position === 'below') {
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
  dispatchEvent(new CustomEvent("data-changed", {
    detail: { target: repositoryTarget },
    bubbles: true,
    composed: true
  }));
};
