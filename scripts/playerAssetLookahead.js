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

// A jump may name only a scene. The story then starts at the scene's initial
// section.
export const createSceneStartIndex = (projectData) => {
  const sceneStarts = new Map();
  for (const [sceneId, scene] of Object.entries(
    projectData?.story?.scenes ?? {},
  )) {
    const sectionId =
      scene?.initialSectionId ?? Object.keys(scene?.sections ?? {})[0];
    if (sectionId) {
      sceneStarts.set(sceneId, sectionId);
    }
  }
  return sceneStarts;
};

const collectJumps = ({ value, key, unconditional, jumps, resourceIds }) => {
  if (key === "resourceId" && typeof value === "string") {
    resourceIds?.add(value);
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (isSectionJumpActionType(key)) {
    jumps.push({
      sectionId: value.sectionId,
      sceneId: value.sceneId,
      unconditional,
    });
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

  // Anything nested runs only on a choice, a click, a condition, or a random
  // pick.
  for (const [entryKey, entry] of Object.entries(value)) {
    collectJumps({
      value: entry,
      key: entryKey,
      unconditional: false,
      jumps,
      resourceIds,
    });
  }
};

// The places a line can move the story to. A jump among the line's own
// actions is `unconditional`: the story always leaves through it. A jump
// inside a choice item, an event, a conditional branch, or a random outcome
// may not be taken.
// `jumpToLine` names a line and, when it has no `sectionId`, stays in the
// section of the line that holds it.
//
// A line can also show a layout or a control whose buttons jump, such as the
// Start button of a title screen. With `resources`, those jumps are included
// as ones that may not be taken.
export const collectLineJumps = (line, resources) => {
  const jumps = [];
  const resourceIds = new Set();
  for (const [actionType, action] of Object.entries(line?.actions ?? {})) {
    collectJumps({
      value: action,
      key: actionType,
      unconditional: true,
      jumps,
      resourceIds,
    });
  }

  for (const resourceId of resourceIds) {
    const shown =
      resources?.layouts?.[resourceId] ?? resources?.controls?.[resourceId];
    collectJumps({ value: shown, unconditional: false, jumps });
  }
  return jumps;
};

const resolveJump = ({ jump, sections, sceneStarts, sectionId }) => {
  const targetSectionId =
    jump.sectionId ??
    (jump.toLine ? sectionId : sceneStarts?.get(jump.sceneId));
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
// so the lines behind such a jump are not listed. The walk ends at an
// unconditional jump whose target is unknown. Each line is followed by the
// opening lines of the places it may jump to: every branch of a choice is
// included because the player's pick is unknown.
//
// An asset that does not fit in what is left of `maxBytes` is left out and the
// walk goes on, so one large picture does not hide the lines after it.
// `getLineAssetIds` may return nothing for a line it has not read yet; the
// walk ends there and `complete` is false.
export const createLookaheadPlan = ({
  sections,
  sceneStarts,
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
        sceneStarts,
        sectionId: position.sectionId,
      });
      if (jump.unconditional) {
        next = target;
        continue;
      }
      if (!target) {
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
    // The story leaves through a jump to a place that is not known.
    if (!next) {
      break;
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
// Counted for a picture when not even its file size is known.
const UNKNOWN_IMAGE_BYTES = 8 * 1024 * 1024;

const pixelBytes = (width, height) =>
  width > 0 && height > 0 ? width * height * 4 : undefined;

// Tells whether an asset of the package is an "image" or "audio"; other
// assets have no kind and are not loaded ahead. The package's `mime` decides.
// A package can list a file under a generic type, so a file with another
// `mime` is looked up in the project's pictures and sounds.
export const createAssetKindLookup = ({ projectData, manifestAssets }) => {
  const resources = projectData?.resources ?? {};
  const kinds = new Map();
  const setKind = (items, kind) => {
    for (const item of Object.values(items ?? {})) {
      if (item?.fileId) {
        kinds.set(item.fileId, kind);
      }
    }
  };
  setKind(resources.images, "image");
  setKind(resources.spritesheets, "image");
  setKind(resources.sounds, "audio");
  for (const sceneVoices of Object.values(resources.voices ?? {})) {
    setKind(sceneVoices, "audio");
  }

  return (assetId) => {
    const asset = manifestAssets?.[assetId];
    if (!asset) {
      return undefined;
    }
    if (asset.mime?.startsWith("image/")) {
      return "image";
    }
    if (asset.mime?.startsWith("audio/")) {
      return "audio";
    }
    return kinds.get(assetId);
  };
};

// Returns what an asset counts for against the picture limit: four bytes per
// pixel once decoded. Sounds count for nothing, because the limit is for
// pictures and sounds are never freed. `manifestAssets` is the package's list
// of assets, with `mime`, `size` and, for some pictures, `width` and `height`.
export const createAssetSizeLookup = ({
  projectData,
  manifestAssets,
  getAssetKind = createAssetKindLookup({ projectData, manifestAssets }),
}) => {
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
    if (getAssetKind(assetId) !== "image") {
      return 0;
    }

    if (!sizes.has(assetId)) {
      const asset = manifestAssets[assetId];
      sizes.set(
        assetId,
        pixelBytes(asset.width, asset.height) ??
          (asset.size > 0
            ? asset.size * UNKNOWN_IMAGE_COMPRESSION
            : UNKNOWN_IMAGE_BYTES),
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

  return {
    startPass() {
      deadline = now() + budgetMs;
      scannedInPass = 0;
    },
    getLineAssetIds(line) {
      if (!lineAssetIds.has(line)) {
        if (scannedInPass > 0 && now() >= deadline) {
          return undefined;
        }

        scannedInPass += 1;
        lineAssetIds.set(line, scanLine(line));
      }
      return lineAssetIds.get(line);
    },
  };
};

// The engine announces each line it enters in a `handleLineActions` effect
// that carries the line's position. Returns the effects handler wrapped so
// that `onLineEntered` hears of it; everything else is passed through.
export const watchLineEntries = (handleEffects, onLineEntered) => {
  const watched = (effects) => {
    for (const effect of effects) {
      if (effect?.name === "handleLineActions" && effect.payload?.pointer) {
        onLineEntered(effect.payload.pointer);
      }
    }
    return handleEffects(effects);
  };
  return Object.assign(watched, handleEffects);
};

// Follows the story's position from the lines the engine enters, because
// asking the engine for its state copies all of it. `readSystemState` is that
// copy; it is read once, for a story whose first line was entered unseen.
//
// It also remembers which screens were queued right after a line was entered,
// which tells a new line's screen from the same screen drawn again.
export const createStoryPosition = ({ readSystemState }) => {
  const lineScreens = new WeakSet();
  let pointer;
  let stateRead = false;
  let lineEntered = false;

  return {
    onLineEntered(nextPointer) {
      pointer = nextPointer;
      lineEntered = true;
    },
    onScreenQueued(renderState) {
      if (lineEntered) {
        lineScreens.add(renderState);
        lineEntered = false;
      }
    },
    entersLine: (renderState) => lineScreens.has(renderState),
    getPointer() {
      if (!pointer && !stateRead) {
        stateRead = true;
        const context = readSystemState()?.contexts?.at(-1);
        pointer = context?.pointers?.[context.currentPointerMode ?? "read"];
      }
      return pointer;
    },
  };
};

const isSubset = (assetIds, others) =>
  assetIds.every((assetId) => others.includes(assetId));

// Plans the loads and frees pictures after screens are drawn. `update` takes
// the screens drawn since the last call, oldest first, each as
// `{ renderState, entersLine }`. It queues the assets the story is about to
// need and frees the pictures used longest ago.
//
// Never freed: pictures on the current screen, the screen before it (it may
// still be fading out), every screen drawn since the last call, screens
// waiting to be drawn, and the plan. A screen is the same screen as the one
// before when the story did not enter a line for it, such as a hovered button
// or a toggled picture, or when it only adds or removes pictures. The same
// screen does not push out the screen that is fading.
//
// `getLoadedAssetIds` and `getStateAssetIds` list pictures only, so sounds
// are never freed. `isAssetLoaded` answers for pictures and sounds.
// `preloader.setPlan` returns the assets it will load.
export const createPlayerAssetLookahead = ({
  sections,
  sceneStarts,
  resources,
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
      lineJumps.set(line, collectLineJumps(line, resources));
    }
    return lineJumps.get(line);
  };
  // A screen is asked for on every pass while it waits to be drawn.
  const stateAssetIds = new WeakMap();
  const getScreenAssetIds = (renderState) => {
    if (!stateAssetIds.has(renderState)) {
      stateAssetIds.set(renderState, getStateAssetIds(renderState));
    }
    return stateAssetIds.get(renderState);
  };
  let updateCount = 0;
  // The pictures of the last screens drawn, oldest first.
  let screens = [];

  const addScreen = ({ renderState, entersLine }) => {
    const assetIds = getScreenAssetIds(renderState);
    const latest = screens.at(-1);
    if (
      latest &&
      (!entersLine || isSubset(assetIds, latest) || isSubset(latest, assetIds))
    ) {
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
    update(drawnScreens = []) {
      updateCount += 1;
      const knownScreenCount = screens.length;
      drawnScreens.forEach(addScreen);
      // With new screens, the oldest known one has been replaced twice.
      if (screens.length > knownScreenCount) {
        screens = screens.slice(Math.max(0, knownScreenCount - 1));
      }

      const plan = createLookaheadPlan({
        sections,
        sceneStarts,
        pointer: getPointer(),
        getLineAssetIds,
        getLineJumps,
        getAssetSize,
        maxBytes: maxBytes / 2,
      });
      const keep = new Set([
        ...screens.flat(),
        ...getWaitingStates().flatMap(getScreenAssetIds),
        ...plan.assetIds,
      ]);
      screens = screens.slice(-2);
      for (const assetId of keep) {
        lastUsed.set(assetId, updateCount);
      }

      const pending = preloader.setPlan(
        plan.assetIds.filter((assetId) => !isAssetLoaded(assetId)),
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

      return plan.complete;
    },
  };
};

// How often in a row a failed pass is run again before the runner waits for
// the next screen.
export const MAX_LOOKAHEAD_RETRIES = 2;
// Only the last screens matter to a later pass.
const MAX_KEPT_SCREENS = 8;

// Runs the lookahead after screens are drawn: once for a burst of screens,
// and again while a plan is still short. Loading ahead only saves time, so a
// failure is reported and never stops the story. The screens of a failed pass
// are given to the next one, so a screen that is fading out stays known.
export const createLookaheadRunner = ({
  update,
  onError,
  schedule = (run) => setTimeout(run, 0),
}) => {
  let drawnScreens = [];
  let scheduled = false;
  let failures = 0;

  const request = () => {
    if (!scheduled) {
      scheduled = true;
      schedule(run);
    }
  };

  function run() {
    scheduled = false;
    const screens = drawnScreens;
    drawnScreens = [];
    try {
      const complete = update(screens);
      failures = 0;
      if (!complete) {
        request();
      }
    } catch (error) {
      drawnScreens = [...screens, ...drawnScreens].slice(-MAX_KEPT_SCREENS);
      failures += 1;
      onError?.(error);
      if (failures <= MAX_LOOKAHEAD_RETRIES) {
        request();
      }
    }
  }

  return {
    onRendered(screen) {
      drawnScreens.push(screen);
      request();
    },
  };
};
