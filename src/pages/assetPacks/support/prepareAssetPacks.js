import { generateId } from "../../../internal/id.js";
import { normalizeAssetPackage } from "../../../internal/assetPackageResources.js";

// The saved selection's folders the project still has, at any depth, as the
// model requires of a pack; a type left with none is dropped.
const keepExistingFolders = ({ repositoryState, resources }) =>
  resources
    .map(({ resourceType, folderIds }) => ({
      resourceType,
      folderIds: folderIds.filter(
        (folderId) =>
          repositoryState?.[resourceType]?.items?.[folderId]?.type === "folder",
      ),
    }))
    .filter(({ folderIds }) => folderIds.length > 0);

// Readies a project's asset packs the first time the page opens:
// - a project with no asset packs or folders gets a folder for them, as new
//   projects do, since packs are added to a folder;
// - a project kept one asset package, outside its resources, before it could
//   have several. That selection becomes its first asset pack, unless it has
//   packs already, and is then cleared. Folders it names that the project no
//   longer has are left out, and a selection left empty only is cleared.
// Returns whether anything changed, and what could not be done: `folderError`
// when the folder could not be made, or `packError` when the selection could
// not become a pack, which keeps the selection for the next time.
export const prepareAssetPacks = async ({
  projectService,
  folderName,
  packName,
}) => {
  let changed = false;
  const repositoryState = projectService.getRepositoryState();
  const assetPacks = repositoryState?.assetPacks;
  const items = Object.entries(assetPacks?.items ?? {});
  let folderId = (assetPacks?.tree ?? []).find(
    (node) => assetPacks.items[node.id]?.type === "folder",
  )?.id;
  if (items.length === 0) {
    folderId = generateId();
    let created;
    try {
      created = await projectService.createAssetPack({
        assetPackId: folderId,
        position: "last",
        data: { type: "folder", name: folderName },
      });
    } catch (error) {
      return { changed, folderError: error };
    }
    if (created?.valid === false) {
      return { changed, folderError: created };
    }
    changed = true;
  }

  let savedAssetPackage;
  try {
    savedAssetPackage = normalizeAssetPackage(
      await projectService.getCurrentAssetPackage(),
    );
  } catch {
    return { changed };
  }
  if (savedAssetPackage.resources.length === 0) {
    return { changed };
  }
  const hasPacks = items.some(([, item]) => item?.type === "assetPack");
  const resources = keepExistingFolders({
    repositoryState,
    resources: savedAssetPackage.resources,
  });
  if (!hasPacks && resources.length > 0) {
    let created;
    try {
      created = await projectService.createAssetPack({
        assetPackId: generateId(),
        parentId: folderId,
        position: "last",
        data: {
          type: "assetPack",
          name: packName,
          description: "",
          resources,
        },
      });
    } catch (error) {
      return { changed, packError: error };
    }
    if (created?.valid === false) {
      return { changed, packError: created };
    }
  }
  await projectService.updateCurrentAssetPackage(normalizeAssetPackage());
  return { changed: true };
};
