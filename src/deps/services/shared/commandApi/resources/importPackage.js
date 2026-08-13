import { ASSET_PACKAGE_RESOURCE_CONFIGS } from "../../../../../internal/assetPackageResources.js";

const COMMAND_CONFIG = Object.freeze(
  Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_CONFIGS.map((config) => [
      config.resourceType,
      { type: config.commandType, idField: config.idField },
    ]),
  ),
);

const invalid = (code, message, details) => ({
  valid: false,
  error: { code, message, details },
});

const createResourceCommand = ({ shared, context, entry, config }) => ({
  commandId: entry.commandId,
  scope: "resources",
  basePartition: shared.resourceTypePartitionFor(
    context.projectId,
    entry.resourceType,
  ),
  type: config.type,
  payload: {
    [config.idField]: entry.destinationId,
    data: structuredClone(entry.data),
    ...shared.buildPlacementPayload({
      parentId: entry.parentDestinationId,
      index: entry.index,
    }),
  },
});

export const createImportPackageCommandApi = (shared) => ({
  async commitAssetImportPackage({
    planId,
    projectId,
    repositoryRevision,
    fileRecords = [],
    fileCommandIds = {},
    entries = [],
  } = {}) {
    const context = await shared.ensureCommandContext();
    if (projectId !== undefined && context.projectId !== projectId) {
      return invalid(
        "project_changed",
        "The project changed while the import was open. Review the import again.",
        { planId },
      );
    }
    if (
      repositoryRevision !== undefined &&
      context.repository.getRevision() !== repositoryRevision
    ) {
      return invalid(
        "project_changed",
        "The project changed while the import was open. Review the import again.",
        { planId },
      );
    }

    const includedFolderIds = new Set();
    for (const entry of entries) {
      if (!COMMAND_CONFIG[entry.resourceType]) {
        return invalid(
          "unsupported_resource_type",
          "This asset type cannot be imported.",
        );
      }
      if (context.state?.[entry.resourceType]?.items?.[entry.destinationId]) {
        return invalid(
          "project_changed",
          "An imported asset id now conflicts with the project. Review the import again.",
          { resourceId: entry.destinationId },
        );
      }
      if (
        entry.parentDestinationId &&
        !includedFolderIds.has(entry.parentDestinationId)
      ) {
        return invalid("invalid_tree", "An imported asset folder is missing.", {
          resourceId: entry.destinationId,
        });
      }
      if (entry.folder) includedFolderIds.add(entry.destinationId);
    }

    const commands = shared.buildMissingFileCommands({
      context,
      fileRecords,
    });
    for (const command of commands) {
      command.commandId = fileCommandIds[command.payload.fileId];
    }
    for (const entry of entries) {
      commands.push(
        createResourceCommand({
          shared,
          context,
          entry,
          config: COMMAND_CONFIG[entry.resourceType],
        }),
      );
    }

    const result = await shared.submitCommandsWithContext({
      context,
      commands,
    });
    if (result?.valid === false) return result;

    return {
      valid: true,
      planId,
      commandIds: result.commandIds,
    };
  },
});
