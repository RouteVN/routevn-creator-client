import {
  decodeProjectCacheValue,
  digestProjectValue,
  encodeProjectCacheValue,
} from "../projectAuthority.js";
import { scenePartitionFor } from "../collab/partitions.js";
import {
  ACCEPTED_MAIN_VIEW_NAME,
  ACCEPTED_SCENE_VIEW_NAME,
  ACCEPTED_VIEW_POLICY,
  MAIN_PARTITION,
  createMainProjectionState,
} from "./shared.js";

export const saveAcceptedState = async ({
  store,
  accepted,
  now = Date.now,
}) => {
  const { state, frontier, legacyPrefix } = accepted;
  const revision = frontier.committedCount + frontier.draftCount;
  const manifest = {};
  for (const [sceneId, scene] of Object.entries(state.scenes.items)) {
    if (scene.type === "folder") continue;
    const digest = digestProjectValue(scene);
    const partition = scenePartitionFor(sceneId);
    const previous = await store.loadMaterializedViewCheckpoint({
      viewName: ACCEPTED_SCENE_VIEW_NAME,
      partition,
    });
    let reusable = false;
    try {
      reusable =
        previous?.viewVersion === ACCEPTED_VIEW_POLICY &&
        previous.value?.digest === digest &&
        digestProjectValue(decodeProjectCacheValue(previous.value.scene)) ===
          digest;
    } catch {
      // A damaged disposable scene cache must not prevent rebuilding it.
    }
    if (reusable) {
      manifest[sceneId] = { digest, revision: previous.lastCommittedId };
      continue;
    }
    await store.saveMaterializedViewCheckpoint({
      viewName: ACCEPTED_SCENE_VIEW_NAME,
      partition,
      viewVersion: ACCEPTED_VIEW_POLICY,
      lastCommittedId: revision,
      value: { digest, scene: encodeProjectCacheValue(scene) },
      updatedAt: now(),
    });
    manifest[sceneId] = { digest, revision };
  }
  const main = createMainProjectionState(state);
  const value = {
    main: encodeProjectCacheValue(main),
    mainDigest: digestProjectValue(main),
    manifest,
    frontier,
  };
  if (legacyPrefix !== undefined) value.legacyPrefix = legacyPrefix;
  // Publish the main manifest last. A failed/interrupted scene write leaves an
  // unverifiable manifest and causes a rebuild on the next open.
  await store.saveMaterializedViewCheckpoint({
    viewName: ACCEPTED_MAIN_VIEW_NAME,
    partition: MAIN_PARTITION,
    viewVersion: ACCEPTED_VIEW_POLICY,
    lastCommittedId: revision,
    value,
    updatedAt: now(),
  });
  return digestProjectValue(value);
};

export const loadAcceptedState = async ({
  store,
  frontier,
  legacyPrefix,
  trustedDigest,
}) => {
  try {
    if (!trustedDigest) return undefined;
    const checkpoint = await store.loadMaterializedViewCheckpoint({
      viewName: ACCEPTED_MAIN_VIEW_NAME,
      partition: MAIN_PARTITION,
    });
    const value = checkpoint?.value;
    if (
      checkpoint?.viewVersion !== ACCEPTED_VIEW_POLICY ||
      digestProjectValue(value) !== trustedDigest ||
      JSON.stringify(value?.frontier) !== JSON.stringify(frontier) ||
      JSON.stringify(value?.legacyPrefix) !== JSON.stringify(legacyPrefix) ||
      !value?.main ||
      digestProjectValue(decodeProjectCacheValue(value.main)) !==
        value.mainDigest
    )
      return undefined;
    const state = decodeProjectCacheValue(value.main);
    const scenes = Object.entries(state.scenes.items).filter(
      ([, scene]) => scene.type !== "folder",
    );
    if (Object.keys(value.manifest ?? {}).length !== scenes.length)
      return undefined;
    for (const [sceneId] of scenes) {
      const entry = value.manifest?.[sceneId];
      if (!entry) return undefined;
      const sceneCheckpoint = await store.loadMaterializedViewCheckpoint({
        viewName: ACCEPTED_SCENE_VIEW_NAME,
        partition: scenePartitionFor(sceneId),
      });
      if (
        sceneCheckpoint?.viewVersion !== ACCEPTED_VIEW_POLICY ||
        sceneCheckpoint.lastCommittedId !== entry.revision ||
        digestProjectValue(
          decodeProjectCacheValue(sceneCheckpoint.value?.scene),
        ) !== entry.digest
      )
        return undefined;
      state.scenes.items[sceneId] = decodeProjectCacheValue(
        sceneCheckpoint.value.scene,
      );
    }
    return { state, frontier, legacyPrefix };
  } catch {
    // These are disposable caches. Malformed or incomplete entries trigger a
    // rebuild from the preserved source history, never a legacy recovery error.
    return undefined;
  }
};
