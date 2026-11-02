import { generateId } from "../../../internal/id.js";
import { normalizeAssetPackage } from "../../../internal/assetPackageResources.js";

// Readies a project's asset packs the first time the page opens:
// - a project with no asset packs or folders gets a folder for them, as new
//   projects do, since packs are added to a folder;
// - a project kept one asset package, outside its resources, before it could
//   have several. That selection becomes its first asset pack, unless it has
//   packs already, and is then cleared.
// Returns whether anything changed.
export const prepareAssetPacks = async ({
  projectService,
  folderName,
  packName,
}) => {
  let changed = false;
  const assetPacks = projectService.getRepositoryState()?.assetPacks;
  const items = Object.entries(assetPacks?.items ?? {});
  let folderId = (assetPacks?.tree ?? []).find(
    (node) => assetPacks.items[node.id]?.type === "folder",
  )?.id;
  if (items.length === 0) {
    folderId = generateId();
    const created = await projectService.createAssetPack({
      assetPackId: folderId,
      position: "last",
      data: { type: "folder", name: folderName },
    });
    if (created?.valid === false) {
      return false;
    }
    changed = true;
  }

  let savedAssetPackage;
  try {
    savedAssetPackage = normalizeAssetPackage(
      await projectService.getCurrentAssetPackage(),
    );
  } catch {
    return changed;
  }
  if (savedAssetPackage.resources.length === 0) {
    return changed;
  }
  const hasPacks = items.some(([, item]) => item?.type === "assetPack");
  if (!hasPacks) {
    const created = await projectService.createAssetPack({
      assetPackId: generateId(),
      parentId: folderId,
      position: "last",
      data: {
        type: "assetPack",
        name: packName,
        description: "",
        resources: savedAssetPackage.resources,
      },
    });
    if (created?.valid === false) {
      return changed;
    }
  }
  await projectService.updateCurrentAssetPackage(normalizeAssetPackage());
  return true;
};
