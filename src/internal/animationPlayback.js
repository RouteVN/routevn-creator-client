import { toFlatItems } from "./project/tree.js";

export const DEFAULT_ANIMATION_PLAYBACK_SPEED = 1;
export const DEFAULT_ANIMATION_PLAYBACK_CONTINUITY = "render";

export const getAnimationType = (item = {}) => {
  return item?.animation?.type === "transition" ? "transition" : "update";
};

export const getAnimationItemById = (collection = {}, animationId) => {
  if (!animationId) {
    return undefined;
  }

  return toFlatItems(collection).find(
    (item) => item.id === animationId && item.type === "animation",
  );
};

export const getAnimationModeById = (collection = {}, animationId) => {
  const item = getAnimationItemById(collection, animationId);
  return item ? getAnimationType(item) : undefined;
};

const getTweenPropertyDurationMs = (tweenProperty) => {
  if (!Array.isArray(tweenProperty?.keyframes)) {
    return 0;
  }

  return tweenProperty.keyframes.reduce((total, keyframe) => {
    const duration =
      typeof keyframe?.duration === "number" &&
      Number.isFinite(keyframe.duration)
        ? keyframe.duration
        : 0;
    const delay =
      typeof keyframe?.delay === "number" && Number.isFinite(keyframe.delay)
        ? Math.max(0, keyframe.delay)
        : 0;
    return total + delay + duration;
  }, 0);
};

const getTweenDurationMs = (tween) => {
  if (!tween || typeof tween !== "object" || Array.isArray(tween)) {
    return 0;
  }

  return Object.values(tween).reduce(
    (maxDuration, tweenProperty) =>
      Math.max(maxDuration, getTweenPropertyDurationMs(tweenProperty)),
    0,
  );
};

export const canLoopAnimationItem = (item) => {
  const animation = item?.animation;
  if (animation?.type !== "update" || animation.complete !== undefined) {
    return false;
  }

  const authoredDurationMs = Math.max(
    getTweenDurationMs(animation.tween),
    getTweenDurationMs(animation.prev?.tween),
    getTweenDurationMs(animation.next?.tween),
    getTweenPropertyDurationMs(animation.mask?.progress),
  );

  return Number.isFinite(authoredDurationMs) && authoredDurationMs > 0;
};

export const canLoopAnimationById = (collection = {}, animationId) => {
  return canLoopAnimationItem(getAnimationItemById(collection, animationId));
};

export const normalizeAnimationPlaybackSpeed = (speed) => {
  const parsedSpeed = Number(speed);
  return Number.isFinite(parsedSpeed) && parsedSpeed > 0
    ? parsedSpeed
    : DEFAULT_ANIMATION_PLAYBACK_SPEED;
};

export const normalizeAnimationPlaybackContinuity = (continuity) => {
  return continuity === "persistent"
    ? "persistent"
    : DEFAULT_ANIMATION_PLAYBACK_CONTINUITY;
};

export const normalizeAnimationPlaybackLoop = (loop) => {
  return loop === true || loop === "true";
};

export const createAnimationReference = ({
  animationId,
  animations,
  playback,
  animationMode,
} = {}) => {
  if (!animationId) {
    return undefined;
  }

  const resolvedAnimationMode =
    getAnimationModeById(animations, animationId) ?? animationMode;
  const reference = {
    resourceId: animationId,
    playback: {
      continuity: normalizeAnimationPlaybackContinuity(playback?.continuity),
      speed: normalizeAnimationPlaybackSpeed(playback?.speed),
    },
  };

  if (resolvedAnimationMode === "update") {
    reference.playback.loop = canLoopAnimationById(animations, animationId)
      ? normalizeAnimationPlaybackLoop(playback?.loop)
      : false;
  }

  return reference;
};
