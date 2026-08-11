import { processWithConcurrency } from "../../../internal/processWithConcurrency.js";
import {
  AssetImportPlanError,
  createAssetImportPlan,
  isAssetPackageManifest,
  rewriteAssetImportPlanReferences,
} from "../../../internal/assetImportPlan.js";
import {
  createResourceImportPlan,
  ResourceImportPlanError,
  rewriteResourceImportPlanReferences,
} from "../../../internal/resourceImportPlan.js";
import { isAssetPackageFileMimeTypeAllowed } from "../../../internal/assetPackageResources.js";
import {
  createImportPackageClient,
  ImportPackageClientError,
} from "../../clients/importPackageClient.js";
import { buildImageResourceDataFromUploadResult } from "./resourceImports.js";

const SUPPORTED_IMPORT_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PREVIEW_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PREVIEW_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

const createFile = ({ bytes, name, mimeType }) => {
  const blob = new Blob([bytes], { type: mimeType });
  if (typeof File === "function") {
    return new File([blob], name, { type: mimeType });
  }
  Object.defineProperty(blob, "name", { value: name });
  return blob;
};

const assertAssetPackageFileMimeTypes = ({ filePlan, mimeType }) => {
  for (const validationKind of filePlan.validationKinds ?? []) {
    if (!isAssetPackageFileMimeTypeAllowed({ validationKind, mimeType })) {
      throw new ImportPackageClientError(
        "file_type_unsupported",
        "A package file has an unsupported type.",
      );
    }
  }
};

const getFileName = (descriptor, sourceId) => {
  if (descriptor.name) return descriptor.name;
  const sourceUrl = descriptor.source?.url ?? descriptor.url;
  try {
    return (
      new URL(sourceUrl, "https://import.invalid/").pathname
        .split("/")
        .filter(Boolean)
        .pop() || sourceId
    );
  } catch {
    return sourceId;
  }
};

const toErrorResult = (error) => {
  if (error?.commitOutcome === "unknown") {
    return {
      valid: false,
      error: {
        code: "commit_outcome_unknown",
        message:
          "The import may have been saved, but confirmation was interrupted. Wait for project sync, then retry safely.",
        retryable: true,
      },
    };
  }
  if (
    error instanceof ImportPackageClientError ||
    error instanceof ResourceImportPlanError ||
    error instanceof AssetImportPlanError
  ) {
    return {
      valid: false,
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable === true,
        path: error.path,
        resourceId: error.resourceId,
        details: error.details,
      },
    };
  }
  return {
    valid: false,
    error: {
      code: "import_failed",
      message: "The package could not be imported.",
      retryable: true,
    },
  };
};

const containsValue = (value, expected) => {
  if (value === expected) return true;
  if (Array.isArray(value)) {
    return value.some((item) => containsValue(item, expected));
  }
  if (!value || typeof value !== "object") return false;
  return Object.values(value).some((item) => containsValue(item, expected));
};

const emitProgress = (onProgress, progress) => {
  try {
    onProgress?.(structuredClone(progress));
  } catch {
    // Import success must not depend on progress/observability consumers.
  }
};

const selectPlanResources = ({ plan, selectedResourceIds }) => {
  const selectedIds = new Set(
    selectedResourceIds ?? plan.resources.map((resource) => resource.sourceId),
  );
  if (plan.assetPackage) {
    const resourceBySourceId = new Map(
      plan.resources.map((resource) => [resource.sourceId, resource]),
    );
    const pendingSourceIds = [...selectedIds];
    while (pendingSourceIds.length > 0) {
      const sourceId = pendingSourceIds.pop();
      const resource = resourceBySourceId.get(sourceId);
      for (const dependencySourceId of resource?.dependencySourceIds ?? []) {
        if (!selectedIds.has(dependencySourceId)) {
          selectedIds.add(dependencySourceId);
          pendingSourceIds.push(dependencySourceId);
        }
      }
    }
  }
  return plan.resources.filter((resource) =>
    selectedIds.has(resource.sourceId),
  );
};

const selectAssetPackageEntries = ({
  plan,
  selectedResources,
  rewrittenResources = selectedResources,
}) => {
  const entryBySourceId = new Map(
    plan.entries.map((entry) => [entry.sourceId, entry]),
  );
  const requiredSourceIds = new Set();
  for (const resource of selectedResources) {
    let entry = entryBySourceId.get(resource.sourceId);
    while (entry) {
      requiredSourceIds.add(entry.sourceId);
      entry = entry.parentSourceId
        ? entryBySourceId.get(entry.parentSourceId)
        : undefined;
    }
  }
  const rewrittenByDestinationId = new Map(
    rewrittenResources.map((resource) => [resource.destinationId, resource]),
  );
  return plan.entries
    .filter((entry) => requiredSourceIds.has(entry.sourceId))
    .map((entry) => ({
      ...entry,
      data:
        rewrittenByDestinationId.get(entry.destinationId)?.data ?? entry.data,
    }));
};

const getCommittedAssetPlanResult = ({
  plan,
  selectedResources,
  repositoryState,
}) => {
  const entries = selectAssetPackageEntries({ plan, selectedResources });
  if (
    entries.length === 0 ||
    entries.some(
      (entry) =>
        repositoryState?.[entry.resourceType]?.items?.[entry.destinationId]
          ?.type !== entry.data.type,
    )
  ) {
    return undefined;
  }
  const primary = selectedResources.find((resource) => resource.primary);
  return {
    valid: true,
    assetPackage: true,
    planId: plan.planId,
    commandIds: [],
    resourceIds: selectedResources.map((resource) => resource.destinationId),
    imageIds: selectedResources
      .filter((resource) => resource.resourceType === "images")
      .map((resource) => resource.destinationId),
    soundIds: selectedResources
      .filter((resource) => resource.resourceType === "sounds")
      .map((resource) => resource.destinationId),
    videoIds: selectedResources
      .filter((resource) => resource.resourceType === "videos")
      .map((resource) => resource.destinationId),
    createdFolderIds: entries
      .filter((entry) => entry.folder)
      .map((entry) => entry.destinationId),
    primaryResourceId:
      primary?.destinationId ?? selectedResources[0]?.destinationId,
    importedCount: selectedResources.length,
    importedImageCount: selectedResources.filter(
      (resource) => resource.resourceType === "images",
    ).length,
    importedSoundCount: selectedResources.filter(
      (resource) => resource.resourceType === "sounds",
    ).length,
    importedVideoCount: selectedResources.filter(
      (resource) => resource.resourceType === "videos",
    ).length,
    reusedImageCount: 0,
    recoveredFromPreviousCommit: true,
  };
};

const getCommittedPlanResult = ({
  plan,
  selectedResources,
  importedImages,
  existingImageIds,
  resourceDestination,
  imageDestination,
  repositoryState,
}) => {
  if (selectedResources.length === 0) return undefined;
  if (plan.assetPackage) {
    return getCommittedAssetPlanResult({
      plan,
      selectedResources,
      repositoryState,
    });
  }
  const allResourcesExist = selectedResources.every(
    (resource) =>
      repositoryState?.[plan.expectedResourceType]?.items?.[
        resource.destinationId
      ]?.type === resource.type,
  );
  const allImagesExist = importedImages.every(
    (image) =>
      repositoryState?.images?.items?.[image.destinationId]?.type === "image",
  );
  const createdDestinations = [
    {
      destination: resourceDestination,
      resourceType: plan.expectedResourceType,
    },
    { destination: imageDestination, resourceType: "images" },
  ].filter(({ destination }) => destination?.mode === "create");
  const allCreatedFoldersExist = createdDestinations.every(
    ({ destination, resourceType }) =>
      repositoryState?.[resourceType]?.items?.[destination.destinationId]
        ?.type === "folder",
  );
  if (!allResourcesExist || !allImagesExist || !allCreatedFoldersExist) {
    return undefined;
  }
  const primary = selectedResources.find((resource) => resource.primary);
  return {
    valid: true,
    planId: plan.planId,
    commandIds: [],
    resourceIds: selectedResources.map((resource) => resource.destinationId),
    imageIds: importedImages.map((image) => image.destinationId),
    reusedImageIds: existingImageIds,
    createdFolderIds: createdDestinations.map(
      ({ destination }) => destination.destinationId,
    ),
    primaryResourceId:
      primary?.destinationId ?? selectedResources[0]?.destinationId,
    importedCount: selectedResources.length,
    importedImageCount: importedImages.length,
    reusedImageCount: existingImageIds.length,
    recoveredFromPreviousCommit: true,
  };
};

const validateReviewChoices = ({
  plan,
  selectedResources,
  resourceChoices,
  resourceNames,
  resourceDescriptions,
}) => {
  if (selectedResources.length === 0) {
    throw new ResourceImportPlanError(
      "no_resources_selected",
      "Select at least one resource to import.",
    );
  }
  for (const resource of selectedResources) {
    const name = resourceNames[resource.sourceId] ?? resource.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new ResourceImportPlanError(
        "resource_name_required",
        "Imported resource names cannot be empty.",
        { resourceId: resource.sourceId },
      );
    }
    const description =
      resourceDescriptions[resource.sourceId] ?? resource.description;
    if (typeof description !== "string") {
      throw new ResourceImportPlanError(
        "resource_description_invalid",
        "Imported resource descriptions must be text.",
        { resourceId: resource.sourceId },
      );
    }
  }

  for (const image of plan.images) {
    const used = selectedResources.some((resource) =>
      containsValue(resource.data, image.destinationId),
    );
    if (!used) continue;
    const choice = resourceChoices[image.sourceId] ?? image.choice;
    if (choice.mode === "existing" && !choice.projectResourceId) {
      throw new ResourceImportPlanError(
        "substitution_required",
        `Choose a replacement for '${image.name}'.`,
        { resourceId: image.sourceId },
      );
    }
    if (choice.mode !== "import" && choice.mode !== "existing") {
      throw new ResourceImportPlanError(
        "dependency_unresolved",
        `Resolve the image dependency '${image.name}'.`,
        { resourceId: image.sourceId },
      );
    }
  }
};

const resolveDestinationChoice = ({
  choice,
  legacyParentId,
  plannedDestination,
  label,
}) => {
  let destination = choice;
  if (!destination && legacyParentId) {
    destination = { mode: "existing", parentId: legacyParentId };
  }
  if (!destination) {
    throw new ResourceImportPlanError(
      "destination_required",
      `Choose a destination folder for ${label}.`,
    );
  }
  if (destination.mode === "existing") {
    if (
      typeof destination.parentId !== "string" ||
      destination.parentId.length === 0
    ) {
      throw new ResourceImportPlanError(
        "destination_required",
        `Choose a destination folder for ${label}.`,
      );
    }
    return { mode: "existing", parentId: destination.parentId };
  }
  if (destination.mode === "create") {
    if (
      typeof destination.name !== "string" ||
      destination.name.trim().length === 0
    ) {
      throw new ResourceImportPlanError(
        "destination_name_required",
        `Enter a name for the new ${label} folder.`,
      );
    }
    return {
      mode: "create",
      name: destination.name.trim(),
      destinationId: plannedDestination.destinationId,
      commandId: plannedDestination.commandId,
    };
  }
  throw new ResourceImportPlanError(
    "invalid_destination_mode",
    `Choose an existing or new destination folder for ${label}.`,
  );
};

export const createResourcePackageImportService = ({
  idGenerator,
  getCurrentProjectId,
  getRepositoryState,
  getRepositoryRevision,
  assetService,
  commandApi,
  importClient = createImportPackageClient(),
  logEvent = () => {},
} = {}) => {
  const plans = new Map();
  const operations = new Map();
  const previewDownloadsByPlan = new Map();

  const beginOperation = (operationId) => {
    const id = operationId ?? idGenerator();
    if (operations.has(id)) {
      throw new ResourceImportPlanError(
        "operation_in_progress",
        "This import operation is already running.",
      );
    }
    const controller = new AbortController();
    operations.set(id, controller);
    return { id, controller };
  };

  const endOperation = (id) => operations.delete(id);
  const deletePlan = (planId) => {
    plans.delete(planId);
    previewDownloadsByPlan.delete(planId);
  };
  const recordEvent = (event, details = {}) => {
    try {
      logEvent(event, structuredClone(details));
    } catch {
      // Observability delivery cannot affect import behavior.
    }
  };

  return {
    async createResourceImportPlan({
      url,
      expectedResourceType,
      operationId,
    } = {}) {
      let operation;
      try {
        recordEvent("plan.started", { expectedResourceType });
        operation = beginOperation(operationId);
        const source = await importClient.fetchManifest({
          url,
          signal: operation.controller.signal,
        });
        const planOptions = {
          manifest: source.manifest,
          manifestUrl: source.manifestUrl,
          projectId: getCurrentProjectId?.(),
          repositoryState: getRepositoryState(),
          repositoryRevision: getRepositoryRevision(),
          createId: idGenerator,
        };
        const plan = isAssetPackageManifest(
          source.manifest,
          expectedResourceType,
        )
          ? createAssetImportPlan(planOptions)
          : createResourceImportPlan({
              ...planOptions,
              expectedResourceType,
            });
        if (plan.knownDownloadBytes > importClient.limits.totalBytes) {
          throw new ImportPackageClientError(
            "download_too_large",
            "The package exceeds the total download limit.",
          );
        }
        plans.set(plan.planId, plan);
        recordEvent("plan.completed", {
          planId: plan.planId,
          expectedResourceType,
          resourceCount: plan.resources.length,
          imageCount: plan.images.length,
          fileCount: plan.files.length,
          knownDownloadBytes: plan.knownDownloadBytes,
        });
        return { valid: true, plan };
      } catch (error) {
        recordEvent("plan.failed", {
          expectedResourceType,
          code: error?.code ?? "import_failed",
        });
        return toErrorResult(error);
      } finally {
        if (operation) endOperation(operation.id);
      }
    },

    async loadResourceImportPreview({
      planId,
      sourceFileId,
      operationId,
    } = {}) {
      let operation;
      try {
        const plan = plans.get(planId);
        if (!plan) {
          throw new ResourceImportPlanError(
            "plan_expired",
            "This import review has expired. Load the package again.",
          );
        }
        const previewFile = plan.previewFiles?.find(
          (file) => file.sourceId === sourceFileId,
        );
        if (!previewFile) {
          throw new ResourceImportPlanError(
            "preview_unavailable",
            "This package preview is unavailable.",
            { resourceId: sourceFileId },
          );
        }
        const mimeType = previewFile.descriptor.mimeType.toLowerCase();
        if (
          !PREVIEW_IMAGE_MIME_TYPES.has(mimeType) &&
          !PREVIEW_VIDEO_MIME_TYPES.has(mimeType)
        ) {
          throw new ResourceImportPlanError(
            "preview_type_unsupported",
            "A package preview must be a JPEG, PNG, WebP, MP4, or WebM file.",
            { resourceId: sourceFileId },
          );
        }

        let previewState = previewDownloadsByPlan.get(planId);
        if (!previewState) {
          previewState = { downloadedBytes: 0, results: new Map() };
          previewDownloadsByPlan.set(planId, previewState);
        }
        const cached = previewState.results.get(sourceFileId);
        if (cached) {
          return { valid: true, preview: cached };
        }

        operation = beginOperation(operationId);
        const download = await importClient.downloadFile({
          descriptor: previewFile.descriptor,
          manifestUrl: plan.manifestUrl,
          signal: operation.controller.signal,
        });
        if (
          previewState.downloadedBytes + download.byteLength >
          importClient.limits.totalBytes
        ) {
          throw new ImportPackageClientError(
            "download_too_large",
            "The package exceeds the total download limit.",
          );
        }
        const preview = {
          sourceFileId,
          bytes: download.bytes,
          mimeType,
          kind: PREVIEW_VIDEO_MIME_TYPES.has(mimeType) ? "video" : "image",
        };
        previewState.downloadedBytes += download.byteLength;
        previewState.results.set(sourceFileId, preview);
        return { valid: true, preview };
      } catch (error) {
        return toErrorResult(error);
      } finally {
        if (operation) endOperation(operation.id);
      }
    },

    validateResourceImportPlan({
      planId,
      selectedResourceIds,
      resourceChoices = {},
      resourceNames = {},
      resourceDescriptions = {},
      resourceDestination,
      imageDestination,
      resourceParentId,
      imageParentId,
    } = {}) {
      try {
        const plan = plans.get(planId);
        if (!plan) {
          throw new ResourceImportPlanError(
            "plan_expired",
            "This import review has expired. Load the package again.",
          );
        }
        const selectedResources = selectPlanResources({
          plan,
          selectedResourceIds,
        });
        validateReviewChoices({
          plan,
          selectedResources,
          resourceChoices,
          resourceNames,
          resourceDescriptions,
        });
        if (plan.assetPackage) {
          return { valid: true };
        }
        resolveDestinationChoice({
          choice: resourceDestination,
          legacyParentId: resourceParentId,
          plannedDestination: plan.destinationFolders.resource,
          label: plan.expectedResourceType,
        });
        const importsPackageImages = plan.images.some(
          (image) =>
            selectedResources.some((resource) =>
              containsValue(resource.data, image.destinationId),
            ) &&
            (resourceChoices[image.sourceId] ?? image.choice).mode === "import",
        );
        if (importsPackageImages) {
          resolveDestinationChoice({
            choice: imageDestination,
            legacyParentId: imageParentId,
            plannedDestination: plan.destinationFolders.images,
            label: "images",
          });
        }
        return { valid: true };
      } catch (error) {
        return toErrorResult(error);
      }
    },

    async executeResourceImportPlan({
      planId,
      operationId,
      selectedResourceIds,
      resourceChoices = {},
      resourceNames = {},
      resourceDescriptions = {},
      resourceDestination,
      imageDestination,
      resourceParentId,
      imageParentId,
      onProgress,
    } = {}) {
      let operation;
      const stagedFileIds = new Set();
      let stagingStarted = false;
      let committed = false;
      let preserveStagedFiles = false;
      let planForCleanup;
      let selectedResourcesForCleanup = [];
      let importedImagesForCleanup = [];
      let existingImageIdsForCleanup = [];
      try {
        const plan = plans.get(planId);
        if (!plan) {
          throw new ResourceImportPlanError(
            "plan_expired",
            "This import review has expired. Load the package again.",
          );
        }
        planForCleanup = plan;
        if (
          plan.projectId !== undefined &&
          getCurrentProjectId?.() !== plan.projectId
        ) {
          throw new ResourceImportPlanError(
            "project_changed",
            "The project changed while the import was open. Review the import again.",
          );
        }
        operation = beginOperation(operationId);
        recordEvent("execution.started", {
          planId,
          expectedResourceType: plan.expectedResourceType,
        });
        const selectedResources = selectPlanResources({
          plan,
          selectedResourceIds,
        });
        selectedResourcesForCleanup = selectedResources;
        validateReviewChoices({
          plan,
          selectedResources,
          resourceChoices,
          resourceNames,
          resourceDescriptions,
        });

        const usedImages = plan.images.filter((image) =>
          selectedResources.some((resource) =>
            containsValue(resource.data, image.destinationId),
          ),
        );
        const importedImages = usedImages.filter((image) => {
          const choice = resourceChoices[image.sourceId] ?? image.choice;
          return choice.mode === "import";
        });
        const existingImageIds = [
          ...new Set(
            usedImages
              .map((image) => resourceChoices[image.sourceId] ?? image.choice)
              .filter((choice) => choice.mode === "existing")
              .map((choice) => choice.projectResourceId),
          ),
        ];
        importedImagesForCleanup = importedImages;
        existingImageIdsForCleanup = existingImageIds;
        let resolvedResourceDestination;
        let resolvedImageDestination;
        if (!plan.assetPackage) {
          resolvedResourceDestination = resolveDestinationChoice({
            choice: resourceDestination,
            legacyParentId: resourceParentId,
            plannedDestination: plan.destinationFolders.resource,
            label: plan.expectedResourceType,
          });
          resolvedImageDestination =
            importedImages.length > 0
              ? resolveDestinationChoice({
                  choice: imageDestination,
                  legacyParentId: imageParentId,
                  plannedDestination: plan.destinationFolders.images,
                  label: "images",
                })
              : undefined;
        }

        const previousCommit = getCommittedPlanResult({
          plan,
          selectedResources,
          importedImages,
          existingImageIds,
          resourceDestination: resolvedResourceDestination,
          imageDestination: resolvedImageDestination,
          repositoryState: getRepositoryState(),
        });
        if (previousCommit) {
          deletePlan(planId);
          committed = true;
          assetService.finalizeResourceImportFiles?.({ planId });
          recordEvent("execution.recovered", {
            planId,
            resourceCount: selectedResources.length,
          });
          return previousCommit;
        }

        const neededSourceIds = new Set(
          importedImages.map((image) => image.sourceFileId),
        );
        for (const file of plan.files) {
          if (
            selectedResources.some((resource) =>
              containsValue(resource.data, file.destinationId),
            )
          ) {
            neededSourceIds.add(file.sourceId);
          }
        }
        const neededFiles = plan.files.filter((file) =>
          neededSourceIds.has(file.sourceId),
        );

        emitProgress(onProgress, {
          phase: "downloading",
          completed: 0,
          total: neededFiles.length,
        });
        let downloadedBytes =
          previewDownloadsByPlan.get(planId)?.downloadedBytes ?? 0;
        let completedDownloads = 0;
        const downloaded = await processWithConcurrency(
          neededFiles,
          async (filePlan) => {
            const result = await importClient.downloadFile({
              descriptor: filePlan.descriptor,
              manifestUrl: plan.manifestUrl,
              signal: operation.controller.signal,
            });
            downloadedBytes += result.byteLength;
            if (downloadedBytes > importClient.limits.totalBytes) {
              throw new ImportPackageClientError(
                "download_too_large",
                "The package exceeds the total download limit.",
              );
            }
            completedDownloads += 1;
            emitProgress(onProgress, {
              phase: "downloading",
              completed: completedDownloads,
              total: neededFiles.length,
              downloadedBytes,
            });
            return { filePlan, download: result };
          },
          {
            concurrency: importClient.limits.downloadConcurrency,
            stopOnError: true,
          },
        );

        const downloadBySourceId = new Map(
          downloaded.map((entry) => [entry.filePlan.sourceId, entry]),
        );
        const stageResults = new Map();
        const fileRecords = [];
        const fileCommandIds = {};
        emitProgress(onProgress, {
          phase: "processing",
          completed: 0,
          total: neededFiles.length,
        });
        let completedStages = 0;
        for (const filePlan of neededFiles) {
          if (operation.controller.signal.aborted) {
            throw new ImportPackageClientError(
              "cancelled",
              "Import cancelled.",
            );
          }
          const entry = downloadBySourceId.get(filePlan.sourceId);
          const importedImage = importedImages.find(
            (image) => image.sourceFileId === filePlan.sourceId,
          );
          const mimeType =
            filePlan.descriptor.mimeType ?? entry.download.contentType;
          if (plan.assetPackage) {
            assertAssetPackageFileMimeTypes({ filePlan, mimeType });
          }
          if (
            importedImage &&
            !SUPPORTED_IMPORT_IMAGE_MIME_TYPES.has(mimeType.toLowerCase())
          ) {
            throw new ImportPackageClientError(
              "file_type_unsupported",
              "A package image has an unsupported type.",
            );
          }
          const file = createFile({
            bytes: entry.download.bytes,
            name: getFileName(filePlan.descriptor, filePlan.sourceId),
            mimeType,
          });
          if (plan.assetPackage) {
            for (const validationKind of filePlan.validationKinds ?? []) {
              try {
                await assetService.validateResourceImportFile({
                  file,
                  validationKind,
                });
              } catch (error) {
                throw new ImportPackageClientError(
                  "file_type_unsupported",
                  "A package file has an unsupported type.",
                  { details: { cause: error.message } },
                );
              }
            }
          }
          stagingStarted = true;
          const stageResult = await assetService.stageResourceImportFile({
            planId: plan.planId,
            projectId: plan.projectId,
            file,
            fileId: filePlan.destinationId,
            thumbnailFileId: importedImage?.thumbnailFileId,
            processImage: Boolean(importedImage),
          });
          stageResults.set(filePlan.sourceId, stageResult);
          for (const record of stageResult.fileRecords ?? []) {
            stagedFileIds.add(record.id);
            fileRecords.push(record);
          }
          fileCommandIds[filePlan.destinationId] = filePlan.commandId;
          if (importedImage && stageResult.thumbnailFileId) {
            fileCommandIds[stageResult.thumbnailFileId] =
              importedImage.thumbnailCommandId;
          }
          completedStages += 1;
          emitProgress(onProgress, {
            phase: "processing",
            completed: completedStages,
            total: neededFiles.length,
          });
        }

        const imageCommands = importedImages.map((image) => {
          const uploadResult = stageResults.get(image.sourceFileId);
          return {
            sourceId: image.sourceId,
            destinationId: image.destinationId,
            commandId: image.commandId,
            data: {
              ...buildImageResourceDataFromUploadResult(uploadResult),
              name: image.name,
              description: image.description,
              tagIds: [],
            },
          };
        });
        const actualFileIds = new Map();
        for (const filePlan of neededFiles) {
          const result = stageResults.get(filePlan.sourceId);
          actualFileIds.set(filePlan.destinationId, result.fileId);
        }
        const rewrittenResources = plan.assetPackage
          ? rewriteAssetImportPlanReferences({
              resources: selectedResources,
              resourceNames,
              resourceDescriptions,
              fileIdMap: actualFileIds,
            })
          : rewriteResourceImportPlanReferences({
              plan: { ...plan, resources: selectedResources },
              resourceChoices,
              resourceNames,
              resourceDescriptions,
              fileIdMap: actualFileIds,
            });
        const selectedTagIds = new Set(
          rewrittenResources.flatMap((resource) => resource.data.tagIds ?? []),
        );
        const selectedTags = plan.tags.filter((tag) =>
          selectedTagIds.has(tag.destinationId),
        );

        emitProgress(onProgress, {
          phase: "committing",
          completed: 0,
          total: 1,
        });
        let commitResult;
        try {
          if (plan.assetPackage) {
            commitResult = await commandApi.commitAssetImportPackage({
              planId: plan.planId,
              projectId: plan.projectId,
              repositoryRevision: plan.repositoryRevision,
              fileRecords,
              fileCommandIds,
              entries: selectAssetPackageEntries({
                plan,
                selectedResources,
                rewrittenResources,
              }),
            });
          } else {
            commitResult = await commandApi.commitResourceImportPackage({
              planId: plan.planId,
              projectId: plan.projectId,
              repositoryRevision: plan.repositoryRevision,
              resourceType: plan.expectedResourceType,
              resourceDestination: resolvedResourceDestination,
              imageDestination: resolvedImageDestination,
              fileRecords,
              fileCommandIds,
              images: imageCommands,
              tags: selectedTags,
              resources: rewrittenResources,
              existingImageIds,
            });
          }
        } catch (error) {
          if (error?.commitOutcome === "unknown") {
            preserveStagedFiles = true;
          }
          throw error;
        }
        if (commitResult?.valid === false) {
          const recoveredCommit = getCommittedPlanResult({
            plan,
            selectedResources,
            importedImages,
            existingImageIds,
            resourceDestination: resolvedResourceDestination,
            imageDestination: resolvedImageDestination,
            repositoryState: getRepositoryState(),
          });
          if (recoveredCommit) {
            deletePlan(planId);
            committed = true;
            assetService.finalizeResourceImportFiles?.({ planId });
            recordEvent("execution.recovered", {
              planId,
              resourceCount: selectedResources.length,
            });
            return recoveredCommit;
          }
          recordEvent("execution.failed", {
            planId,
            code: commitResult.error?.code ?? "import_failed",
          });
          return commitResult;
        }
        committed = true;
        assetService.finalizeResourceImportFiles?.({ planId: plan.planId });
        deletePlan(planId);
        const primary = rewrittenResources.find((resource) => resource.primary);
        emitProgress(onProgress, {
          phase: "complete",
          completed: 1,
          total: 1,
        });
        recordEvent("execution.completed", {
          planId,
          resourceCount: rewrittenResources.length,
          importedImageCount: imageCommands.length,
          reusedImageCount: existingImageIds.length,
          downloadedBytes,
        });
        const result = {
          ...commitResult,
          primaryResourceId:
            primary?.destinationId ?? rewrittenResources[0]?.destinationId,
          importedCount: rewrittenResources.length,
          importedImageCount: imageCommands.length,
          reusedImageCount: existingImageIds.length,
        };
        if (plan.assetPackage) {
          result.assetPackage = true;
          result.importedImageCount = rewrittenResources.filter(
            (resource) => resource.resourceType === "images",
          ).length;
          result.importedSoundCount = rewrittenResources.filter(
            (resource) => resource.resourceType === "sounds",
          ).length;
          result.importedVideoCount = rewrittenResources.filter(
            (resource) => resource.resourceType === "videos",
          ).length;
        }
        return result;
      } catch (error) {
        recordEvent("execution.failed", {
          planId,
          code:
            error?.commitOutcome === "unknown"
              ? "commit_outcome_unknown"
              : (error?.code ?? "import_failed"),
        });
        return toErrorResult(error);
      } finally {
        let committedDuringCleanup;
        if (!committed && planForCleanup) {
          try {
            committedDuringCleanup = getCommittedPlanResult({
              plan: planForCleanup,
              selectedResources: selectedResourcesForCleanup,
              importedImages: importedImagesForCleanup,
              existingImageIds: existingImageIdsForCleanup,
              repositoryState: getRepositoryState(),
            });
          } catch {
            // Cleanup below still uses the plan's captured project reference.
          }
        }
        if (committedDuringCleanup) {
          preserveStagedFiles = true;
        }
        if (
          !committed &&
          !preserveStagedFiles &&
          (stagingStarted || stagedFileIds.size > 0)
        ) {
          try {
            recordEvent("cleanup.started", {
              planId,
              fileCount: stagedFileIds.size,
            });
            await assetService.discardResourceImportFiles({
              planId,
              fileIds: [...stagedFileIds],
            });
            recordEvent("cleanup.completed", {
              planId,
              fileCount: stagedFileIds.size,
            });
          } catch {
            recordEvent("cleanup.failed", {
              planId,
              fileCount: stagedFileIds.size,
            });
            // The project has no visible references to retained staged blobs.
          }
        }
        if (operation) endOperation(operation.id);
      }
    },

    cancelResourceImport({ operationId } = {}) {
      const controller = operations.get(operationId);
      if (!controller) return { cancelled: false };
      controller.abort();
      recordEvent("execution.cancelled", { operationId });
      return { cancelled: true };
    },
  };
};
