// The player loads a picture or sound the first time a screen needs it, which
// makes that line slow to appear. The lookahead lists the assets the story is
// about to need so they can load before the player gets there, and picks which
// loaded pictures to free once they use too much memory.

export const LOOKAHEAD_LINE_COUNT = 20;
export const LOOKAHEAD_BRANCH_LINE_COUNT = 3;

export const createSectionLineIndex = (projectData) => {
  const sections = new Map();
  for (const scene of Object.values(projectData?.story?.scenes ?? {})) {
    for (const [sectionId, section] of Object.entries(scene?.sections ?? {})) {
      sections.set(sectionId, section?.lines ?? []);
    }
  }
  return sections;
};

// A line can move the story to another section from a choice item, a jump, or
// a conditional branch. All of them name the target in a `sectionId` field.
const collectJumpSectionIds = (value, sections, result = new Set()) => {
  if (!value || typeof value !== "object") {
    return result;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (key === "sectionId" && sections.has(entry)) {
      result.add(entry);
    } else {
      collectJumpSectionIds(entry, sections, result);
    }
  }
  return result;
};

// Returns asset ids in the order the story is likely to need them: the lines
// after the current one, each followed by the opening lines of the sections it
// can jump to. Every branch of a choice is included because the player's pick
// is unknown. The list stops when it would pass `maxBytes`.
export const createLookaheadPlan = ({
  sections,
  pointer,
  getLineAssetIds,
  getAssetSize,
  maxBytes,
  lineCount = LOOKAHEAD_LINE_COUNT,
  branchLineCount = LOOKAHEAD_BRANCH_LINE_COUNT,
}) => {
  const lines = sections.get(pointer?.sectionId) ?? [];
  const currentIndex = lines.findIndex((line) => line.id === pointer?.lineId);
  if (currentIndex === -1) {
    return [];
  }

  const plan = new Set();
  let bytes = 0;
  const addLine = (line) => {
    for (const assetId of getLineAssetIds(line)) {
      if (plan.has(assetId)) {
        continue;
      }

      bytes += getAssetSize(assetId);
      if (bytes > maxBytes) {
        return false;
      }
      plan.add(assetId);
    }
    return true;
  };

  const upcomingLines = lines.slice(currentIndex, currentIndex + lineCount + 1);
  for (const line of upcomingLines) {
    if (!addLine(line)) {
      return Array.from(plan);
    }

    for (const sectionId of collectJumpSectionIds(line, sections)) {
      const branchLines = sections.get(sectionId).slice(0, branchLineCount);
      for (const branchLine of branchLines) {
        if (!addLine(branchLine)) {
          return Array.from(plan);
        }
      }
    }
  }

  return Array.from(plan);
};

// `loaded` maps an asset id to `{ size, lastUsed }`. Frees the assets used
// longest ago until the rest fit in `maxBytes`, and never frees one in `keep`.
export const selectAssetsToEvict = ({ loaded, keep, maxBytes }) => {
  let bytes = 0;
  for (const { size } of loaded.values()) {
    bytes += size;
  }

  const candidates = Array.from(loaded)
    .filter(([assetId]) => !keep.has(assetId))
    .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
  const evicted = [];
  for (const [assetId, { size }] of candidates) {
    if (bytes <= maxBytes) {
      break;
    }

    evicted.push(assetId);
    bytes -= size;
  }
  return evicted;
};

// Decoded pixels the loaded pictures may hold. Half of it is the most the plan
// may claim, which leaves room for the screens already shown.
export const MAX_LOADED_IMAGE_BYTES = 160 * 1024 * 1024;

// Call `update` after each screen is drawn. It queues the assets the story is
// about to need and frees the pictures used longest ago. Pictures on the
// current screen, the screen before it (it may still be fading out), screens
// waiting to be drawn, and the plan are never freed. `getLoadedAssetIds` and
// `getStateAssetIds` list pictures only, so sounds are never freed.
export const createPlayerAssetLookahead = ({
  sections,
  getPointer,
  getLineAssetIds,
  getStateAssetIds,
  getWaitingStates,
  getAssetSize,
  getLoadedAssetIds,
  unloadAssets,
  preloader,
  maxBytes = MAX_LOADED_IMAGE_BYTES,
}) => {
  const lastUsed = new Map();
  let updateCount = 0;
  let previousAssetIds = [];

  return {
    update(renderState) {
      updateCount += 1;
      const currentAssetIds = getStateAssetIds(renderState);
      const plan = createLookaheadPlan({
        sections,
        pointer: getPointer(),
        getLineAssetIds,
        getAssetSize,
        maxBytes: maxBytes / 2,
      });
      const keep = new Set([
        ...currentAssetIds,
        ...previousAssetIds,
        ...getWaitingStates().flatMap(getStateAssetIds),
        ...plan,
      ]);
      previousAssetIds = currentAssetIds;

      // Planned assets count as loaded so room is made before they arrive.
      const loadedAssetIds = new Set(getLoadedAssetIds());
      const loaded = new Map();
      for (const assetId of keep) {
        lastUsed.set(assetId, updateCount);
      }
      for (const assetId of new Set([...loadedAssetIds, ...plan])) {
        loaded.set(assetId, {
          size: getAssetSize(assetId),
          lastUsed: lastUsed.get(assetId) ?? 0,
        });
      }

      const evicted = selectAssetsToEvict({ loaded, keep, maxBytes });
      if (evicted.length > 0) {
        evicted.forEach((assetId) => lastUsed.delete(assetId));
        unloadAssets(evicted);
      }

      preloader.setPlan(plan.filter((assetId) => !loadedAssetIds.has(assetId)));
    },
  };
};
