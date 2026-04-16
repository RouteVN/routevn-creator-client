import { processWithConcurrency } from "../../../processWithConcurrency.js";
import { generatePrefixedId } from "../../../id.js";

const CREATE_ABORT_ERROR = "pending-upload-create-abort";

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

export const processPendingUploads = async ({
  deps,
  files,
  parentId,
  pendingIdPrefix = "pending-item",
  concurrency = 1,
  refresh = async () => {},
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
