import { processWithConcurrency } from "../../../processWithConcurrency.js";
import { generatePrefixedId } from "../../../id.js";
import { getLocalProjectPathFromPayload } from "../../../localProjectRoute.js";

const CREATE_ABORT_ERROR = "pending-upload-create-abort";

// Leaving a project waits for its uploads, but not for ever: a file that never
// finishes processing must not keep the user from leaving.
const MAX_LEAVE_WAIT_MS = 120_000;

const createAbortError = () => {
  const error = new Error(CREATE_ABORT_ERROR);
  error.code = CREATE_ABORT_ERROR;
  return error;
};

const defaultPendingName = (file) => {
  return file?.name?.replace(/\.[^.]+$/, "") ?? "";
};

const createPendingUploads = ({
  files,
  parentId,
  pendingIdPrefix,
  getPendingName = defaultPendingName,
} = {}) => {
  if (!parentId) {
    return [];
  }

  return (Array.isArray(files) ? files : []).map((file) => ({
    id: generatePrefixedId(`${pendingIdPrefix}-`),
    file,
    parentId,
    name: getPendingName(file),
  }));
};

const waitForBatch = (batch) => {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, MAX_LEAVE_WAIT_MS);
  });
  return Promise.race([batch.catch(() => {}), timeout]).finally(() => {
    clearTimeout(timer);
  });
};

// Whether a navigation to `destination` leaves the project at `routePayload`.
// A save before the app suspends or backs up has no destination: it does not
// leave the project, and waiting there would hold up the editors' saves.
const leavesProject = (destination, routePayload) => {
  if (destination?.path === undefined) {
    return false;
  }

  const { payload } = destination;
  return (
    (payload?.p ?? "") !== (routePayload.p ?? "") ||
    getLocalProjectPathFromPayload(payload) !==
      getLocalProjectPathFromPayload(routePayload)
  );
};

// Stores the files in the project open when the uploads start. Leaving that
// project waits until they finish, for up to MAX_LEAVE_WAIT_MS: its files and
// items can only be saved while it is open. The batch registers itself rather than its page, because
// moving to another page of the same project does not stop it.
export const processPendingUploads = async (options) => {
  const { appService } = options.deps;
  const routePayload = appService.getPayload();
  const batch = runPendingUploads(options);
  const unregisterBeforeNavigation = appService.registerBeforeNavigation(
    (destination) => {
      if (!leavesProject(destination, routePayload)) {
        return undefined;
      }
      // Navigation only waits for the batch; its caller handles a failure.
      return waitForBatch(batch);
    },
  );

  try {
    return await batch;
  } finally {
    unregisterBeforeNavigation();
  }
};

const runPendingUploads = async ({
  deps,
  files,
  parentId,
  pendingIdPrefix = "pending-item",
  concurrency = 1,
  refresh = async () => {},
  processFile,
  createItem = async () => false,
  onUploadError,
  onNoSuccessfulUploads,
  getPendingName,
} = {}) => {
  const { projectService, store, render } = deps;
  const fileList = Array.isArray(files) ? files : [];
  const pendingUploads = createPendingUploads({
    files: fileList,
    parentId,
    pendingIdPrefix,
    getPendingName,
  });
  const remainingPendingUploadIds = new Set(
    pendingUploads.map((item) => item.id),
  );
  const pendingUploadIdByFile = new Map(
    pendingUploads.map((item) => [item.file, item.id]),
  );
  const removePendingUploads = (itemIds) => {
    const normalizedItemIds = (itemIds ?? []).filter((itemId) =>
      remainingPendingUploadIds.has(itemId),
    );
    if (normalizedItemIds.length === 0) {
      return;
    }

    store.removePendingUploads({ itemIds: normalizedItemIds });
    normalizedItemIds.forEach((itemId) =>
      remainingPendingUploadIds.delete(itemId),
    );
    render();
  };

  if (pendingUploads.length > 0) {
    store.addPendingUploads({
      items: pendingUploads.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        name: item.name,
      })),
    });
    render();
  }

  let successfulUploadCount = 0;

  try {
    await processWithConcurrency(
      fileList,
      async (file) => {
        const pendingUploadId = pendingUploadIdByFile.get(file);
        if (typeof processFile === "function") {
          const removePendingUpload = () => {
            removePendingUploads([pendingUploadId]);
          };
          const created = await processFile({
            file,
            parentId,
            pendingUploadId,
            removePendingUpload,
          });

          removePendingUpload();

          if (!created) {
            throw createAbortError();
          }

          successfulUploadCount += 1;
          await refresh(deps);
          return { ok: true };
        }

        const uploadResults = await projectService.uploadFiles([file]);
        const uploadResult = uploadResults?.[0];

        if (!uploadResult) {
          removePendingUploads([pendingUploadId]);
          return { ok: false, reason: "upload-failed" };
        }

        successfulUploadCount += 1;

        const created = await createItem({
          file,
          uploadResult,
          parentId,
        });

        removePendingUploads([pendingUploadId]);

        if (!created) {
          throw createAbortError();
        }

        await refresh(deps);
        return { ok: true };
      },
      {
        concurrency,
        stopOnError: true,
      },
    );
  } catch (error) {
    removePendingUploads([...remainingPendingUploadIds]);
    if (error?.code === CREATE_ABORT_ERROR) {
      return { status: "create-aborted" };
    }

    await onUploadError?.({ error });
    return { status: "upload-failed", error };
  }

  if (successfulUploadCount === 0) {
    onNoSuccessfulUploads?.({ fileCount: fileList.length });
    return { status: "no-successful-uploads" };
  }

  return { status: "ok", successfulUploadCount };
};
