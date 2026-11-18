// The player loads a picture or sound the first time a screen needs it, which
// makes that line slow to appear. The lookahead lists the assets the story is
// about to need so they can load before the player gets there, and picks which
// loaded pictures to free once they use too much memory.
import { isSectionJumpActionType } from "../src/internal/navigationActions.js";

export const LOOKAHEAD_LINE_COUNT = 30;
export const LOOKAHEAD_BRANCH_LINE_COUNT = 5;

export const createSectionLineIndex = (projectData) => {
  const sections = new Map();
  for (const scene of Object.values(projectData?.story?.scenes ?? {})) {
    for (const [sectionId, section] of Object.entries(scene?.sections ?? {})) {
      sections.set(sectionId, section?.lines ?? []);
    }
  }
  return sections;
};

const collectJumps = ({ value, key, unconditional, jumps }) => {
  if (!value || typeof value !== "object") {
    return;
  }

  if (isSectionJumpActionType(key)) {
    jumps.push({ sectionId: value.sectionId, unconditional });
    return;
  }

  if (key === "jumpToLine") {
    jumps.push({
      sectionId: value.sectionId,
      lineId: value.lineId,
      toLine: true,
      unconditional,
    });
    return;
  }

  // Anything nested runs only on a choice, a click, or a condition.
  for (const [entryKey, entry] of Object.entries(value)) {
    collectJumps({ value: entry, key: entryKey, unconditional: false, jumps });
  }
};

// The places a line can move the story to. A jump among the line's own
// actions is `unconditional`: the story always leaves through it. A jump
// inside a choice item, an event, or a conditional branch may not be taken.
// `jumpToLine` names a line and, when it has no `sectionId`, stays in the
// section of the line that holds it.
export const collectLineJumps = (line) => {
  const jumps = [];
  for (const [actionType, action] of Object.entries(line?.actions ?? {})) {
    collectJumps({
      value: action,
      key: actionType,
      unconditional: true,
      jumps,
    });
  }
  return jumps;
};

const resolveJump = ({ jump, sections, sectionId }) => {
  const targetSectionId =
    jump.sectionId ?? (jump.toLine ? sectionId : undefined);
  const lines = sections.get(targetSectionId);
  if (!lines) {
    return undefined;
  }

  const index = jump.toLine
    ? lines.findIndex((line) => line.id === jump.lineId)
    : 0;
  return index === -1 ? undefined : { sectionId: targetSectionId, index };
};

// Lists asset ids in the order the story is likely to need them. It walks the
// lines after the current one and follows an unconditional jump to its target,
// so the lines behind such a jump are not listed. Each line is followed by the
// opening lines of the places it may jump to: every branch of a choice is
// included because the player's pick is unknown.
//
// An asset that does not fit in what is left of `maxBytes` is left out and the
// walk goes on, so one large picture does not hide the lines after it.
// `getLineAssetIds` may return nothing for a line it has not read yet; the
// walk ends there and `complete` is false.
export const createLookaheadPlan = ({
  sections,
  pointer,
  getLineAssetIds,
  getAssetSize,
  maxBytes,
  getLineJumps = collectLineJumps,
  lineCount = LOOKAHEAD_LINE_COUNT,
  branchLineCount = LOOKAHEAD_BRANCH_LINE_COUNT,
}) => {
  const plan = new Set();
  const currentLines = sections.get(pointer?.sectionId) ?? [];
  const currentIndex = currentLines.findIndex(
    (line) => line.id === pointer?.lineId,
  );
  if (currentIndex === -1) {
    return { assetIds: [], complete: true };
  }

  let bytes = 0;
  const addLine = (line) => {
    const assetIds = getLineAssetIds(line);
    if (!assetIds) {
      return false;
    }

    for (const assetId of assetIds) {
      const size = getAssetSize(assetId);
      if (plan.has(assetId) || bytes + size > maxBytes) {
        continue;
      }

      bytes += size;
      plan.add(assetId);
    }
    return true;
  };
  const incomplete = () => ({ assetIds: Array.from(plan), complete: false });

  const visited = new Set();
  let position = { sectionId: pointer.sectionId, index: currentIndex };
  for (let count = 0; count <= lineCount; count++) {
    const line = sections.get(position.sectionId)[position.index];
    // A story that jumps back to a line already walked has nothing new.
    if (!line || visited.has(line)) {
      break;
    }
    visited.add(line);
    if (!addLine(line)) {
      return incomplete();
    }

    let next = { sectionId: position.sectionId, index: position.index + 1 };
    for (const jump of getLineJumps(line)) {
      const target = resolveJump({
        jump,
        sections,
        sectionId: position.sectionId,
      });
      if (!target) {
        continue;
      }

      if (jump.unconditional) {
        next = target;
        continue;
      }

      const branchLines = sections
        .get(target.sectionId)
        .slice(target.index, target.index + branchLineCount);
      for (const branchLine of branchLines) {
        if (!addLine(branchLine)) {
          return incomplete();
        }
      }
    }
    position = next;
  }

  return { assetIds: Array.from(plan), complete: true };
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

// A picture whose pixel size is unknown is assumed to be compressed this many
// times. Art with flat colors compresses far more than photos, and guessing
// high only frees pictures a little early.
const UNKNOWN_IMAGE_COMPRESSION = 16;

const pixelBytes = (width, height) =>
  width > 0 && height > 0 ? width * height * 4 : undefined;

// Returns what an asset counts for against the picture limit: four bytes per
// pixel once decoded. Sounds count for nothing, because the limit is for
// pictures and sounds are never freed. `manifestAssets` is the package's list of assets, with `mime`,
// `size` and, for some pictures, `width` and `height`.
export const createAssetSizeLookup = ({ projectData, manifestAssets }) => {
  const sizes = new Map();
  const setSize = (fileId, size) => {
    if (fileId && size !== undefined) {
      sizes.set(fileId, size);
    }
  };
  for (const image of Object.values(projectData?.resources?.images ?? {})) {
    setSize(image?.fileId, pixelBytes(image?.width, image?.height));
  }
  // A spritesheet is decoded as the whole sheet, not as one frame.
  for (const sheet of Object.values(
    projectData?.resources?.spritesheets ?? {},
  )) {
    const sheetSize = sheet?.jsonData?.meta?.size;
    setSize(
      sheet?.fileId,
      pixelBytes(sheet?.sheetWidth, sheet?.sheetHeight) ??
        pixelBytes(sheetSize?.w, sheetSize?.h),
    );
  }

  return (assetId) => {
    const asset = manifestAssets?.[assetId];
    if (!asset?.mime?.startsWith("image/")) {
      return 0;
    }

    if (!sizes.has(assetId)) {
      sizes.set(
        assetId,
        pixelBytes(asset.width, asset.height) ??
          (asset.size ?? 0) * UNKNOWN_IMAGE_COMPRESSION,
      );
    }
    return sizes.get(assetId);
  };
};

// Reading the assets of a line walks every resource the line uses, which is
// slow for the 30 lines of a first plan. This reads lines for `budgetMs` per
// pass and then answers nothing for lines it has not read, so the plan stops
// short and the next pass goes on from there. Every pass reads at least one
// line.
export const createLineAssetScanner = ({ scanLine, now, budgetMs }) => {
  const lineAssetIds = new WeakMap();
  let deadline = 0;
  let scannedInPass = 0;
  let behind = false;

  return {
    startPass() {
      deadline = now() + budgetMs;
      scannedInPass = 0;
      behind = false;
    },
    getLineAssetIds(line) {
      if (!lineAssetIds.has(line)) {
        if (scannedInPass > 0 && now() >= deadline) {
          behind = true;
          return undefined;
        }

        scannedInPass += 1;
        lineAssetIds.set(line, scanLine(line));
      }
      return lineAssetIds.get(line);
    },
    // True when the pass left lines unread.
    isBehind: () => behind,
  };
};

const isSubset = (assetIds, others) =>
  assetIds.every((assetId) => others.includes(assetId));

// Plans the loads and frees pictures after screens are drawn. `update` takes
// the screens drawn since the last call, oldest first. It queues the assets
// the story is about to need and frees the pictures used longest ago.
//
// Never freed: pictures on the current screen, the screen before it (it may
// still be fading out), every screen drawn since the last call, screens
// waiting to be drawn, and the plan. A screen drawn again with a picture
// added or removed, such as a hovered button, counts as the same screen, so
// it does not push out the screen that is fading.
//
// `getLoadedAssetIds` and `getStateAssetIds` list pictures only, so sounds
// are never freed. `isAssetLoaded` answers for pictures and sounds.
export const createPlayerAssetLookahead = ({
  sections,
  getPointer,
  getLineAssetIds,
  getStateAssetIds,
  getWaitingStates,
  getAssetSize,
  getLoadedAssetIds,
  isAssetLoaded,
  unloadAssets,
  preloader,
  maxBytes = MAX_LOADED_IMAGE_BYTES,
}) => {
  const lastUsed = new Map();
  const lineJumps = new WeakMap();
  const getLineJumps = (line) => {
    if (!lineJumps.has(line)) {
      lineJumps.set(line, collectLineJumps(line));
    }
    return lineJumps.get(line);
  };
  let updateCount = 0;
  // The pictures of the last screens drawn, oldest first.
  let screens = [];

  const addScreen = (assetIds) => {
    const latest = screens.at(-1);
    if (latest && (isSubset(assetIds, latest) || isSubset(latest, assetIds))) {
      screens[screens.length - 1] = Array.from(
        new Set([...latest, ...assetIds]),
      );
      return;
    }
    screens.push(assetIds);
  };

  return {
    // Returns false when the plan stopped short and `update` should run
    // again; nothing is freed until the plan is whole.
    update(renderStates = []) {
      updateCount += 1;
      const knownScreenCount = screens.length;
      renderStates.forEach((renderState) => {
        addScreen(getStateAssetIds(renderState));
      });
      // With new screens, the oldest known one has been replaced twice.
      if (screens.length > knownScreenCount) {
        screens = screens.slice(Math.max(0, knownScreenCount - 1));
      }

      const plan = createLookaheadPlan({
        sections,
        pointer: getPointer(),
        getLineAssetIds,
        getLineJumps,
        getAssetSize,
        maxBytes: maxBytes / 2,
      });
      const keep = new Set([
        ...screens.flat(),
        ...getWaitingStates().flatMap(getStateAssetIds),
        ...plan.assetIds,
      ]);
      screens = screens.slice(-2);
      for (const assetId of keep) {
        lastUsed.set(assetId, updateCount);
      }

      const pending = plan.assetIds.filter(
        (assetId) => !isAssetLoaded(assetId) && !preloader.hasGivenUp(assetId),
      );
      if (plan.complete) {
        // Pending assets count as loaded so room is made before they arrive.
        const loaded = new Map();
        for (const assetId of new Set([...getLoadedAssetIds(), ...pending])) {
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
      }

      preloader.setPlan(pending);
      return plan.complete;
    },
  };
};

// Runs the lookahead after screens are drawn: once for a burst of screens,
// and again while a plan is still short. Loading ahead only saves time, so a
// failure is reported and never stops the story.
export const createLookaheadRunner = ({
  update,
  onError,
  schedule = (run) => setTimeout(run, 0),
}) => {
  let drawnStates = [];
  let scheduled = false;

  const request = () => {
    if (!scheduled) {
      scheduled = true;
      schedule(run);
    }
  };

  function run() {
    scheduled = false;
    const renderStates = drawnStates;
    drawnStates = [];
    try {
      if (!update(renderStates)) {
        request();
      }
    } catch (error) {
      onError?.(error);
    }
  }

  return {
    onRendered(renderState) {
      drawnStates.push(renderState);
      request();
    },
  };
};
