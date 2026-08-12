import { processWithConcurrency } from "../../../internal/processWithConcurrency.js";
import {
  AssetImportPlanError,
  createAssetImportPlan,
  rewriteAssetImportPlanReferences,
} from "../../../internal/assetImportPlan.js";
import { isAssetPackageFileMimeTypeAllowed } from "../../../internal/assetPackageResources.js";
import {
  createImportPackageClient,
  ImportPackageClientError,
} from "../../clients/importPackageClient.js";

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

const fail = (code, message, options) => {
  throw new AssetImportPlanError(code, message, options);
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
  return plan.resources.filter((resource) =>
    selectedIds.has(resource.sourceId),
  );
};

const selectPackageEntries = ({
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

const getCommittedPlanResult = ({
  plan,
  selectedResources,
  repositoryState,
}) => {
  if (selectedResources.length === 0) return undefined;
  const entries = selectPackageEntries({ plan, selectedResources });
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
  return {
    valid: true,
    planId: plan.planId,
    commandIds: [],
    importedCount: selectedResources.length,
    recoveredFromPreviousCommit: true,
  };
};

const validateReviewChoices = ({
  selectedResources,
  resourceNames,
  resourceDescriptions,
}) => {
  if (selectedResources.length === 0) {
    fail("no_resources_selected", "Select at least one resource to import.");
  }
  for (const resource of selectedResources) {
    const name = resourceNames[resource.sourceId] ?? resource.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      fail(
        "resource_name_required",
        "Imported resource names cannot be empty.",
        { resourceId: resource.sourceId },
      );
    }
    const description =
      resourceDescriptions[resource.sourceId] ?? resource.description;
    if (typeof description !== "string") {
      fail(
        "resource_description_invalid",
        "Imported resource descriptions must be text.",
        { resourceId: resource.sourceId },
      );
    }
  }
};

const assertFileMimeTypes = ({ filePlan, mimeType }) => {
  for (const validationKind of filePlan.validationKinds ?? []) {
    if (!isAssetPackageFileMimeTypeAllowed({ validationKind, mimeType })) {
      throw new ImportPackageClientError(
        "file_type_unsupported",
        "A package file has an unsupported type.",
      );
    }
  }
};

const getNeededFiles = ({ plan, selectedResources }) =>
  plan.files.filter((file) =>
    selectedResources.some((resource) =>
      resource.fileDestinationIds.includes(file.destinationId),
    ),
  );

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
      fail(
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
    async createResourceImportPlan({ url, operationId } = {}) {
      let operation;
      try {
        recordEvent("plan.started");
        operation = beginOperation(operationId);
        const source = await importClient.fetchManifest({
          url,
          signal: operation.controller.signal,
        });
        const plan = createAssetImportPlan({
          manifest: source.manifest,
          manifestUrl: source.manifestUrl,
          projectId: getCurrentProjectId?.(),
          repositoryState: getRepositoryState(),
          repositoryRevision: getRepositoryRevision(),
          createId: idGenerator,
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
          resourceCount: plan.resources.length,
          fileCount: plan.files.length,
          knownDownloadBytes: plan.knownDownloadBytes,
        });
        return { valid: true, plan };
      } catch (error) {
        recordEvent("plan.failed", {
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
          fail(
            "plan_expired",
            "This import review has expired. Load the package again.",
          );
        }
        const previewFile = plan.previewFiles.find(
          (file) => file.sourceId === sourceFileId,
        );
        if (!previewFile) {
          fail("preview_unavailable", "This package preview is unavailable.", {
            resourceId: sourceFileId,
          });
        }
        const mimeType = previewFile.descriptor.mimeType.toLowerCase();
        if (
          !PREVIEW_IMAGE_MIME_TYPES.has(mimeType) &&
          !PREVIEW_VIDEO_MIME_TYPES.has(mimeType)
        ) {
          fail(
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
      resourceNames = {},
      resourceDescriptions = {},
    } = {}) {
      try {
        const plan = plans.get(planId);
        if (!plan) {
          fail(
            "plan_expired",
            "This import review has expired. Load the package again.",
          );
        }
        const selectedResources = selectPlanResources({
          plan,
          selectedResourceIds,
        });
        validateReviewChoices({
          selectedResources,
          resourceNames,
          resourceDescriptions,
        });
        return { valid: true };
      } catch (error) {
        return toErrorResult(error);
      }
    },

    async executeResourceImportPlan({
      planId,
      operationId,
      selectedResourceIds,
      resourceNames = {},
      resourceDescriptions = {},
      onProgress,
    } = {}) {
      let operation;
      const stagedFileIds = new Set();
      let stagingStarted = false;
      let committed = false;
      let preserveStagedFiles = false;
      let planForCleanup;
      let selectedResourcesForCleanup = [];
      try {
        const plan = plans.get(planId);
        if (!plan) {
          fail(
            "plan_expired",
            "This import review has expired. Load the package again.",
          );
        }
        planForCleanup = plan;
        if (
          plan.projectId !== undefined &&
          getCurrentProjectId?.() !== plan.projectId
        ) {
          fail(
            "project_changed",
            "The project changed while the import was open. Review the import again.",
          );
        }
        operation = beginOperation(operationId);
        recordEvent("execution.started", { planId });
        const selectedResources = selectPlanResources({
          plan,
          selectedResourceIds,
        });
        selectedResourcesForCleanup = selectedResources;
        validateReviewChoices({
          selectedResources,
          resourceNames,
          resourceDescriptions,
        });

        const previousCommit = getCommittedPlanResult({
          plan,
          selectedResources,
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

        const neededFiles = getNeededFiles({ plan, selectedResources });
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
          const mimeType =
            filePlan.descriptor.mimeType ?? entry.download.contentType;
          assertFileMimeTypes({ filePlan, mimeType });
          const file = createFile({
            bytes: entry.download.bytes,
            name: getFileName(filePlan.descriptor, filePlan.sourceId),
            mimeType,
          });
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
          stagingStarted = true;
          const stageResult = await assetService.stageResourceImportFile({
            planId: plan.planId,
            projectId: plan.projectId,
            file,
            fileId: filePlan.destinationId,
            processImage: false,
          });
          stageResults.set(filePlan.sourceId, stageResult);
          for (const record of stageResult.fileRecords ?? []) {
            stagedFileIds.add(record.id);
            fileRecords.push(record);
          }
          fileCommandIds[filePlan.destinationId] = filePlan.commandId;
          completedStages += 1;
          emitProgress(onProgress, {
            phase: "processing",
            completed: completedStages,
            total: neededFiles.length,
          });
        }

        const actualFileIds = new Map(
          neededFiles.map((filePlan) => [
            filePlan.destinationId,
            stageResults.get(filePlan.sourceId).fileId,
          ]),
        );
        const rewrittenResources = rewriteAssetImportPlanReferences({
          resources: selectedResources,
          resourceNames,
          resourceDescriptions,
          fileIdMap: actualFileIds,
        });
        emitProgress(onProgress, {
          phase: "committing",
          completed: 0,
          total: 1,
        });
        let commitResult;
        try {
          commitResult = await commandApi.commitAssetImportPackage({
            planId: plan.planId,
            projectId: plan.projectId,
            repositoryRevision: plan.repositoryRevision,
            fileRecords,
            fileCommandIds,
            entries: selectPackageEntries({
              plan,
              selectedResources,
              rewrittenResources,
            }),
          });
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
        assetService.finalizeResourceImportFiles?.({ planId });
        deletePlan(planId);
        emitProgress(onProgress, {
          phase: "complete",
          completed: 1,
          total: 1,
        });
        recordEvent("execution.completed", {
          planId,
          resourceCount: rewrittenResources.length,
          downloadedBytes,
        });
        return {
          ...commitResult,
          importedCount: rewrittenResources.length,
        };
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
              repositoryState: getRepositoryState(),
            });
          } catch {
            // Cleanup still uses the plan's captured project reference.
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
