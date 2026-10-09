import { dataUrlToBlob } from "../../../internal/dataUrl.js";
import {
  createTransformThumbnailSource,
  TRANSFORM_THUMBNAIL_VERSION,
} from "../../../internal/transformPreview.js";
import { createThumbnailSourceHash } from "./thumbnailSourceHash.js";

const renderDefaultThumbnail = async (options) => {
  const client = await import("../../clients/web/editorThumbnails.js");
  return client.renderThumbnailImage(options);
};

// Thumbnails draw between the user's own work.
const waitForIdle = () =>
  new Promise((resolve) => {
    if (typeof globalThis.requestIdleCallback === "function") {
      globalThis.requestIdleCallback(() => resolve(), { timeout: 2000 });
      return;
    }
    globalThis.setTimeout(resolve, 200);
  });

// Draws the thumbnails of saved items in the background, on a renderer of its
// own, so neither leaving an editor nor a list page waits for one. A
// thumbnail is drawn only when its `thumbnailSourceHash` no longer matches
// what it would show, so asking again is cheap.
export const createEditorThumbnailService = ({
  getEnsuredProjectId,
  getRepositoryState,
  getFileContent,
  storeFileForProject,
  updateTransform,
  renderThumbnail = renderDefaultThumbnail,
  waitUntilIdle = waitForIdle,
}) => {
  const pendingJobs = new Map();
  let running;

  // A job's work counts only while its project is the one open.
  const isOpen = (projectId) => getEnsuredProjectId() === projectId;

  // The transform's thumbnail source and its hash, when it is out of date.
  const findStaleTransformThumbnail = async (transformId) => {
    const repositoryState = getRepositoryState();
    const item = repositoryState.transforms?.items?.[transformId];
    if (item?.type !== "transform") {
      return undefined;
    }

    const source = createTransformThumbnailSource({ item, repositoryState });
    const thumbnailSourceHash = await createThumbnailSourceHash({
      version: TRANSFORM_THUMBNAIL_VERSION,
      renderState: source.renderState,
    });
    return item.thumbnailSourceHash === thumbnailSourceHash
      ? undefined
      : { source, thumbnailSourceHash };
  };

  // A preview image that cannot be read leaves the old thumbnail in place,
  // since drawing the fallback would misrepresent the preview.
  const drawThumbnail = async ({ projectResolution, renderState, images }) => {
    const contents = [];
    try {
      const imageAssets = {};
      for (const image of images) {
        if (imageAssets[image.fileId]) {
          continue;
        }
        const content = await getFileContent(image.fileId, {
          verifyImageIntegrity: true,
        });
        contents.push(content);
        imageAssets[image.fileId] = {
          url: content.url,
          type: image.fileType ?? content.type ?? "image/png",
        };
      }
      return await renderThumbnail({
        width: projectResolution.width,
        height: projectResolution.height,
        renderState,
        imageAssets,
      });
    } finally {
      contents.forEach((content) => content.revoke?.());
    }
  };

  // Checking a hash is cheap, so only drawing waits for the app to be idle,
  // and the transform is read again after the wait.
  const syncTransformThumbnail = async ({ projectId, transformId }) => {
    if (
      !isOpen(projectId) ||
      !(await findStaleTransformThumbnail(transformId))
    ) {
      return;
    }
    await waitUntilIdle();
    if (!isOpen(projectId)) {
      return;
    }
    const stale = await findStaleTransformThumbnail(transformId);
    if (!stale) {
      return;
    }

    const thumbnailImage = await drawThumbnail(stale.source);
    if (!isOpen(projectId)) {
      return;
    }
    const thumbnailFile = await storeFileForProject({
      projectId,
      file: dataUrlToBlob(thumbnailImage),
    });
    if (!isOpen(projectId)) {
      return;
    }
    // The hash describes what was drawn, so it stays right even if the
    // transform changed meanwhile; the next request draws that change.
    const result = await updateTransform({
      transformId,
      data: {
        thumbnailFileId: thumbnailFile.fileId,
        thumbnailSourceHash: stale.thumbnailSourceHash,
      },
      fileRecords: [thumbnailFile.fileRecord],
    });
    if (result?.valid === false) {
      console.warn("[editorThumbnails] The thumbnail update was rejected", {
        transformId,
        result,
      });
    }
  };

  // Jobs run one at a time. A failure only logs, since no one is waiting on a
  // thumbnail; the next request tries again.
  const runPendingJobs = async () => {
    while (pendingJobs.size > 0) {
      const [key, job] = pendingJobs.entries().next().value;
      pendingJobs.delete(key);
      try {
        await syncTransformThumbnail(job);
      } catch (error) {
        console.warn("[editorThumbnails] Failed to update a thumbnail", {
          transformId: job.transformId,
          error,
        });
      }
    }
  };

  const startRunning = () => {
    running ??= runPendingJobs().finally(() => {
      running = undefined;
      if (pendingJobs.size > 0) {
        startRunning();
      }
    });
    return running;
  };

  return {
    // Brings the named transforms' thumbnails up to date, or every
    // transform's in the open project when none are named. Callers do not
    // wait for it; the promise settles when the queue is empty and never
    // rejects.
    requestTransformThumbnails({ transformIds } = {}) {
      const projectId = getEnsuredProjectId();
      if (!projectId) {
        return Promise.resolve();
      }
      const ids =
        transformIds ??
        Object.values(getRepositoryState().transforms?.items ?? {})
          .filter((item) => item.type === "transform")
          .map((item) => item.id);
      for (const transformId of ids) {
        pendingJobs.set(`${projectId}:${transformId}`, {
          projectId,
          transformId,
        });
      }
      return startRunning();
    },
  };
};
