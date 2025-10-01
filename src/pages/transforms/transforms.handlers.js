import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository.js";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { transforms } = repository.getState();
  store.setItems(transforms || { tree: [], items: {} });
  render();
};

export const handleDataChanged = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const repositoryState = repository.getState();
  const { transforms } = repositoryState;

  const transformData = transforms || { tree: [], items: {} };

  store.setItems(transformData);
  render();
};

export const handleTransformItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail;
  store.setSelectedItemId(itemId);
  render();
};

export const handleTransformItemDoubleClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail;

  // Find the transform item
  const flatItems = toFlatItems(store.getState().transformData);
  const transformItem = flatItems.find((item) => item.id === itemId);

  if (transformItem) {
    // Open edit dialog with transform data
    store.openTransformFormDialog({
      editMode: true,
      itemId: itemId,
      itemData: transformItem,
    });
    render();
  }
};

export const handleAddTransformClick = (e, deps) => {
  const { store, render } = deps;
  const { groupId } = e.detail;

  store.openTransformFormDialog({
    targetGroupId: groupId,
  });
  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleTransformCreated = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    e.detail;

  console.log("22222222222222 created", e.detail);

  repository.addAction({
    actionType: "treePush",
    target: "transforms",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "transform",
        name: name,
        x,
        y,
        scaleX: scaleX,
        scaleY: scaleY,
        anchorX: anchorX,
        anchorY: anchorY,
        rotation: rotation,
      },
    },
  });

  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "transforms",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};

export const handleTransformEdited = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    e.detail;

  // Update repository directly
  repository.addAction({
    actionType: "treeUpdate",
    target: "transforms",
    value: {
      id: itemId,
      replace: false,
      item: {
        name,
        x,
        y,
        scaleX,
        scaleY,
        anchorX,
        anchorY,
        rotation,
      },
    },
  });

  // Update local state and render immediately
  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};
export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (e, deps) => {
  const { store, render } = deps;
  const { groupId } = e.detail;
  store.toggleGroupCollapse(groupId);
  render();
};
