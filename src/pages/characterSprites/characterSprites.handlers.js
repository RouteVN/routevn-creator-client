import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCharacterSpritesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { tap } from "rxjs";

const EMPTY_TREE = { items: {}, tree: [] };
const ACCEPTED_FILE_TYPES = ".jpg,.jpeg,.png,.webp";

const getCharacterIdFromPayload = ({ appService }) => {
  return appService.getPayload().characterId;
};

const getCharacter = ({ projectService, characterId }) => {
  return projectService.getState().characters.items?.[characterId];
};

const createDetailFormValues = (item, imageSrc) => ({
  fileId: imageSrc,
  name: item?.name ?? "",
  description: item?.description ?? "",
});

const syncDetailForm = ({ refs, values } = {}) => {
  const { detailForm } = refs;
  if (!detailForm) {
    return;
  }

  detailForm.reset();
  detailForm.setValues({ values });
};

const getPreviewImageSrc = async ({ projectService, item } = {}) => {
  if (!item?.fileId) {
    return undefined;
  }

  const { url } = await projectService.getFileContent(item.fileId);
  return url;
};

const resolveSelectedPreviewImageSrc = async ({
  projectService,
  store,
  previousSelectedItem,
  selectedItem,
} = {}) => {
  if (!selectedItem?.fileId) {
    return undefined;
  }

  const currentPreviewImageSrc = store.selectPreviewImageSrc();
  if (
    currentPreviewImageSrc &&
    previousSelectedItem?.id === selectedItem.id &&
    previousSelectedItem?.fileId === selectedItem.fileId
  ) {
    return currentPreviewImageSrc;
  }

  return getPreviewImageSrc({
    projectService,
    item: selectedItem,
  });
};

const syncCharacterSpritesData = async (deps) => {
  const { appService, projectService, store } = deps;
  const characterId =
    store.selectCharacterId() ?? getCharacterIdFromPayload(deps);

  if (!characterId) {
    appService.showToast("Character is missing.", { title: "Error" });
    return {};
  }

  const character = getCharacter({
    projectService,
    characterId,
  });

  if (!character) {
    appService.showToast("Character not found.", { title: "Error" });
    return {};
  }

  store.setCharacterId({ characterId });
  store.setCharacterName({ characterName: character.name });
  store.setItems({ spritesData: character.sprites ?? EMPTY_TREE });

  if (store.selectSelectedItemId() && !store.selectSelectedItem()) {
    store.setSelectedItemId({ itemId: undefined });
  }

  const selectedItem = store.selectSelectedItem();
  const imageSrc = await getPreviewImageSrc({
    projectService,
    item: selectedItem,
  });

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });

  return {
    characterId,
    selectedItem,
    imageSrc,
  };
};

const refreshCharacterSpritesData = async (deps) => {
  const { render, refs } = deps;
  const { selectedItem, imageSrc } = await syncCharacterSpritesData(deps);
  render();

  if (selectedItem) {
    syncDetailForm({
      refs,
      values: createDetailFormValues(selectedItem, imageSrc),
    });
  }
};

const syncCharacterSpritesRepositoryState = async ({
  deps,
  repositoryState,
} = {}) => {
  const { appService, projectService, store, render, refs } = deps;
  const characterId =
    store.selectCharacterId() ?? getCharacterIdFromPayload(deps);
  const character = repositoryState?.characters?.items?.[characterId];

  if (!characterId) {
    appService.showToast("Character is missing.", { title: "Error" });
    store.clearCharacterSpritesView();
    render();
    return;
  }

  if (!character) {
    appService.showToast("Character not found.", { title: "Error" });
    store.clearCharacterSpritesView();
    render();
    return;
  }

  const previousSelectedItem = store.selectSelectedItem();
  store.setCharacterId({ characterId });
  store.setCharacterName({ characterName: character.name });
  store.setItems({ spritesData: character.sprites ?? EMPTY_TREE });

  if (store.selectSelectedItemId() && !store.selectSelectedItem()) {
    store.setSelectedItemId({ itemId: undefined });
  }

  const selectedItem = store.selectSelectedItem();
  const imageSrc = await resolveSelectedPreviewImageSrc({
    projectService,
    store,
    previousSelectedItem,
    selectedItem,
  });

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });

  render();

  if (selectedItem) {
    syncDetailForm({
      refs,
      values: createDetailFormValues(selectedItem, imageSrc),
    });
  }
};

const selectSprite = async ({ deps, itemId, syncExplorer = false } = {}) => {
  const { projectService, refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  store.setSelectedItemId({ itemId });

  if (syncExplorer) {
    refs.fileExplorer.selectItem({ itemId });
  }

  const imageSrc = await getPreviewImageSrc({
    projectService,
    item,
  });

  store.setContext({
    context: {
      fileId: {
        src: imageSrc,
      },
    },
  });

  render();
  syncDetailForm({
    refs,
    values: createDetailFormValues(item, imageSrc),
  });
};

const createSpritesFromFiles = async ({
  deps,
  files,
  parentId = null,
} = {}) => {
  const { appService, projectService, store } = deps;
  let successfulUploads;

  try {
    successfulUploads = await projectService.uploadFiles(files);
  } catch {
    appService.showToast("Failed to upload sprites.", { title: "Error" });
    return;
  }

  if (!successfulUploads.length) {
    appService.showToast("Failed to upload sprites.", { title: "Error" });
    return;
  }

  const characterId = store.selectCharacterId();
  if (!characterId) {
    appService.showToast("Character is missing.", { title: "Error" });
    return;
  }

  for (const result of successfulUploads) {
    await projectService.createCharacterSpriteItem({
      characterId,
      spriteId: nanoid(),
      parentId,
      position: "last",
      data: {
        type: "image",
        fileId: result.fileId,
        name: result.displayName,
        fileType: result.file.type,
        fileSize: result.file.size,
        width: result.dimensions.width,
        height: result.dimensions.height,
      },
    });
  }

  await refreshCharacterSpritesData(deps);
};

export const handleBeforeMount = (deps) => {
  const { projectService } = deps;
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        void syncCharacterSpritesRepositoryState({
          deps,
          repositoryState,
        });
      }),
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createCharacterSpritesFileExplorerHandlers({
    getCharacterId: (deps) =>
      deps.store.selectCharacterId() ?? getCharacterIdFromPayload(deps),
    refresh: refreshCharacterSpritesData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshCharacterSpritesData;

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { render, store } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    store.setContext({
      context: {
        fileId: {
          src: undefined,
        },
      },
    });
    render();
    return;
  }

  await selectSprite({
    deps,
    itemId,
  });
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { render, store } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder || !itemId) {
    return;
  }

  store.showFullImagePreview({ itemId });
  render();
};

export const handleSpriteItemClick = async (deps, payload) => {
  const { itemId } = payload._event.detail;

  await selectSprite({
    deps,
    itemId,
    syncExplorer: true,
  });
};

export const handleSpriteItemDoubleClick = (deps, payload) => {
  const { render, store } = deps;
  const { itemId } = payload._event.detail;

  if (!itemId) {
    return;
  }

  store.showFullImagePreview({ itemId });
  render();
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: ACCEPTED_FILE_TYPES,
      multiple: true,
    });
  } catch {
    appService.showToast("Failed to select files.", { title: "Error" });
    return;
  }

  if (!files?.length) {
    return;
  }

  await createSpritesFromFiles({
    deps,
    files,
    parentId: groupId,
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { files, targetGroupId } = payload._event.detail;

  await createSpritesFromFiles({
    deps,
    files,
    parentId: targetGroupId,
  });
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const characterId = store.selectCharacterId();
  const selectedItemId = store.selectSelectedItemId();

  if (!characterId || !selectedItemId) {
    return;
  }

  await projectService.updateCharacterSpriteItem({
    characterId,
    spriteId: selectedItemId,
    data: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const character = getCharacter({
    projectService,
    characterId,
  });

  store.setItems({
    spritesData: character?.sprites ?? EMPTY_TREE,
  });
  render();
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store } = deps;
  const selectedItem = store.selectSelectedItem();

  if (!selectedItem) {
    return;
  }

  let file;

  try {
    file = await appService.pickFiles({
      accept: ACCEPTED_FILE_TYPES,
      multiple: false,
      upload: true,
    });
  } catch {
    appService.showToast("Failed to select file.", { title: "Error" });
    return;
  }

  if (!file) {
    return;
  }

  if (!(file.uploadSucessful && file.uploadResult)) {
    appService.showToast("Failed to upload sprite.", { title: "Error" });
    return;
  }

  const uploadResult = file.uploadResult;
  const characterId = store.selectCharacterId();
  if (!characterId) {
    appService.showToast("Character is missing.", { title: "Error" });
    return;
  }

  await projectService.updateCharacterSpriteItem({
    characterId,
    spriteId: selectedItem.id,
    data: {
      fileId: uploadResult.fileId,
      name: uploadResult.displayName,
      fileType: uploadResult.file.type,
      fileSize: uploadResult.file.size,
      width: uploadResult.dimensions.width,
      height: uploadResult.dimensions.height,
    },
  });

  await refreshCharacterSpritesData(deps);
};

export const handleSearchInput = (deps, payload) => {
  const { render, store } = deps;
  store.setSearchQuery({ query: payload._event.detail.value ?? "" });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { itemId } = payload._event.detail;
  const characterId = store.selectCharacterId();

  if (!characterId || !itemId) {
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

  await projectService.deleteCharacterSpriteItem({
    characterId,
    spriteIds: [itemId],
  });

  await refreshCharacterSpritesData(deps);
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/project/characters", appService.getPayload());
};
