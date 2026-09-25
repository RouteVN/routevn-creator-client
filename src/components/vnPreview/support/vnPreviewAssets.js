import {
  getAssetTimeoutMs,
  runAsyncOperation,
} from "../../../internal/asyncOperation.js";
import {
  getAssetNames,
  getAssetLoadFailures,
} from "../../../internal/ui/assetLoadFeedback.js";

// Collect damaged/missing files across the startup batch; a deadline or close
// stops startup immediately and preserves the exact stalled stage in the UI.
export const loadPreviewStartupAssets = async (
  { projectService, graphicsService, i18n },
  fileReferences,
  { signal, onProgress = () => {}, resources = {} } = {},
) => {
  const references = new Map(fileReferences.map((item) => [item.url, item]));
  const repository = projectService.getRepositoryState?.() ?? {};
  const names = getAssetNames(repository, resources, i18n?.resourceTypes ?? {});
  const assets = {};
  const contents = [];
  const failures = [];
  const total = references.size;
  const progress = (stage, completed, fileId) => {
    signal?.throwIfAborted();
    onProgress({
      stage,
      completed,
      total,
      assetName: names.get(fileId) ?? fileId,
    });
  };
  const fail = (fileId, cause) => {
    signal?.throwIfAborted();
    // File adapters can wrap a timeout in an integrity/font error.
    let nested = cause;
    while (nested) {
      if (nested.name === "TimeoutError") throw nested;
      nested = nested.cause;
    }
    const error = new Error(`Unable to load asset ${fileId}.`, { cause });
    error.fileId = fileId;
    failures.push(error);
  };
  try {
    let checked = 0;
    for (const [fileId, reference] of references) {
      progress("reading", checked, fileId);
      const metadata = repository.files?.items?.[fileId] ?? reference;
      try {
        const content = await runAsyncOperation(
          () =>
            projectService.getFileContent(fileId, {
              verifyImageIntegrity: true,
              signal,
            }),
          {
            signal,
            timeoutMs: getAssetTimeoutMs(metadata),
            label: `Read asset ${fileId}`,
            onLateResolve: (content) => content.revoke?.(),
          },
        );
        contents.push(content);
        assets[fileId] = {
          url: content.url,
          buffer: content.buffer,
          size: metadata.size,
          type: reference.type ?? content.type ?? "image/png",
          fontWeightDescriptor: reference.fontWeightDescriptor,
        };
      } catch (error) {
        fail(fileId, error);
      }
      progress("reading", ++checked);
    }
    const entries = Object.entries(assets);
    if (entries.length > 0) {
      progress("decoding", 0, entries[0][0]);
      try {
        await graphicsService.loadAssets(assets, {
          signal,
          onProgress: ({ completed, fileId }) =>
            progress("decoding", completed, fileId),
        });
      } catch (error) {
        signal?.throwIfAborted();
        if (error.name === "TimeoutError") throw error;
        if (
          error instanceof AggregateError &&
          getAssetLoadFailures(error).every((item) => item.fileId)
        ) {
          for (const item of getAssetLoadFailures(error))
            fail(item.fileId, item.error);
        } else if (entries.length === 1) fail(entries[0][0], error);
        else {
          for (const [fileId, asset] of entries) {
            progress("decoding", 0, fileId);
            try {
              await graphicsService.loadAssets({ [fileId]: asset }, { signal });
            } catch (cause) {
              fail(fileId, cause);
            }
          }
        }
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures, "Preview assets could not be loaded.");
    progress("decoding", total);
    return Object.keys(assets);
  } catch (error) {
    contents.forEach((content) => content.revoke?.());
    throw error;
  }
};
