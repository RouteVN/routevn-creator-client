import { dataUrlToBlob } from "../../../internal/dataUrl.js";
import {
  createParticleThumbnailSource,
  PARTICLE_THUMBNAIL_VERSION,
} from "../../../internal/particlePreview.js";
import {
  createTransformThumbnailSource,
  TRANSFORM_THUMBNAIL_VERSION,
} from "../../../internal/transformPreview.js";
import { createThumbnailSourceHash } from "./thumbnailSourceHash.js";

// Particles move on the renderer's own clock, so their thumbnail shows them
// after they have run this long.
const PARTICLE_THUMBNAIL_SETTLE_MS = 1500;

const renderDefaultThumbnail = async (options) => {
  const client = await import("../../clients/web/editorThumbnails.js");
  return client.renderThumbnailImage(options);
};

const releaseDefaultRenderer = async () => {
  const client = await import("../../clients/web/editorThumbnails.js");
  await client.releaseThumbnailRenderer();
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
  updateParticle,
  renderThumbnail = renderDefaultThumbnail,
  releaseRenderer = releaseDefaultRenderer,
  waitUntilIdle = waitForIdle,
}) => {
  // Each kind of item with a thumbnail: where it is kept, how its thumbnail
  // is drawn from saved data, and how it is saved.
  const kinds = {
    transform: {
      collection: "transforms",
      version: TRANSFORM_THUMBNAIL_VERSION,
      createSource: createTransformThumbnailSource,
      save: ({ id, data, fileRecords }) =>
        updateTransform({ transformId: id, data, fileRecords }),
    },
    particle: {
      collection: "particles",
      version: PARTICLE_THUMBNAIL_VERSION,
      createSource: createParticleThumbnailSource,
      settleMs: PARTICLE_THUMBNAIL_SETTLE_MS,
      save: ({ id, data, fileRecords }) =>
        updateParticle({ particleId: id, data, fileRecords }),
    },
  };
  const pendingJobs = new Map();
  let running;
  let rendererInUse = false;

  // A job's work counts only while its project is the one open.
  const isOpen = (projectId) => getEnsuredProjectId() === projectId;

  // The item's thumbnail source and its hash, when it is out of date.
  const findStaleThumbnail = async ({ kind, id }) => {
    const { collection, version, createSource } = kinds[kind];
    const repositoryState = getRepositoryState();
    const item = repositoryState[collection]?.items?.[id];
    if (item?.type !== kind) {
      return undefined;
    }

    const source = createSource({ item, repositoryState });
    const thumbnailSourceHash = await createThumbnailSourceHash({
      version,
      renderState: source.renderState,
    });
    return item.thumbnailSourceHash === thumbnailSourceHash
      ? undefined
      : { source, thumbnailSourceHash };
  };

  // A preview image that cannot be read leaves the old thumbnail in place,
  // since drawing the fallback would misrepresent the preview.
  const drawThumbnail = async (
    { width, height, renderState, images },
    { settleMs },
  ) => {
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
        width,
        height,
        renderState,
        imageAssets,
        settleMs,
      });
    } finally {
      contents.forEach((content) => content.revoke?.());
    }
  };

  // Checking a hash is cheap, so only drawing waits for the app to be idle,
  // and the item is read again after the wait.
  const syncThumbnail = async (job) => {
    const { projectId, kind, id } = job;
    if (!isOpen(projectId) || !(await findStaleThumbnail(job))) {
      return;
    }
    await waitUntilIdle();
    if (!isOpen(projectId)) {
      return;
    }
    const stale = await findStaleThumbnail(job);
    if (!stale) {
      return;
    }

    rendererInUse = true;
    const thumbnailImage = await drawThumbnail(stale.source, kinds[kind]);
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
    // The hash describes what was drawn, so it stays right even if the item
    // changed meanwhile; the next request draws that change.
    const result = await kinds[kind].save({
      id,
      data: {
        thumbnailFileId: thumbnailFile.fileId,
        thumbnailSourceHash: stale.thumbnailSourceHash,
      },
      fileRecords: [thumbnailFile.fileRecord],
    });
    if (result?.valid === false) {
      console.warn("[editorThumbnails] The thumbnail update was rejected", {
        kind,
        id,
        result,
      });
    }
  };

  // Jobs run one at a time, on one renderer, which is freed once there are
  // none left. A failure only logs, since no one is waiting on a thumbnail;
  // the next request tries again.
  const runPendingJobs = async () => {
    while (pendingJobs.size > 0) {
      const [key, job] = pendingJobs.entries().next().value;
      pendingJobs.delete(key);
      try {
        await syncThumbnail(job);
      } catch (error) {
        console.warn("[editorThumbnails] Failed to update a thumbnail", {
          kind: job.kind,
          id: job.id,
          error,
        });
      }
    }
    if (rendererInUse) {
      rendererInUse = false;
      try {
        await releaseRenderer();
      } catch (error) {
        console.warn("[editorThumbnails] Failed to free the renderer", {
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

  // Queues the named items of a kind, or all of them in the open project when
  // none are named.
  const requestThumbnails = (kind, ids) => {
    const projectId = getEnsuredProjectId();
    if (!projectId) {
      return Promise.resolve();
    }
    const itemIds =
      ids ??
      Object.values(getRepositoryState()[kinds[kind].collection]?.items ?? {})
        .filter((item) => item.type === kind)
        .map((item) => item.id);
    for (const id of itemIds) {
      pendingJobs.set(`${projectId}:${kind}:${id}`, { projectId, kind, id });
    }
    return startRunning();
  };

  return {
    // Bring thumbnails up to date. Callers do not wait for them; the promise
    // settles when the queue is empty and never rejects.
    requestTransformThumbnails({ transformIds } = {}) {
      return requestThumbnails("transform", transformIds);
    },
    requestParticleThumbnails({ particleIds } = {}) {
      return requestThumbnails("particle", particleIds);
    },
  };
};
