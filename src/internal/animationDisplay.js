import { getTransitionMaskDuration } from "./animationMasks.js";

const getDialogType = (animationType) => {
  return animationType === "transition" ? "transition" : "update";
};

export const getUpdateAnimationTween = (item = {}) => {
  if (
    item?.animation?.type === "update" &&
    item.animation.tween &&
    typeof item.animation.tween === "object"
  ) {
    return item.animation.tween;
  }

  return {};
};

const getTransitionSideTween = (item = {}, side) => {
  if (
    item?.animation?.type === "transition" &&
    item.animation?.[side]?.tween &&
    typeof item.animation[side].tween === "object"
  ) {
    return item.animation[side].tween;
  }

  return {};
};

const getTweenPropertyDuration = (propertyConfig = {}) => {
  if (propertyConfig?.auto) {
    return Number(propertyConfig.auto.duration) || 0;
  }

  return (propertyConfig?.keyframes ?? []).reduce((sum, keyframe) => {
    return (
      sum +
      Math.max(0, Number(keyframe?.delay) || 0) +
      (Number(keyframe?.duration) || 0)
    );
  }, 0);
};

const getAnimationDuration = (tween = {}) => {
  return Object.values(tween).reduce((maxDuration, propertyConfig) => {
    const totalDuration = getTweenPropertyDuration(propertyConfig);

    return Math.max(maxDuration, totalDuration);
  }, 0);
};

export const getTransitionTimelineDuration = ({
  prevProperties = {},
  nextProperties = {},
  mask,
} = {}) => {
  return Math.max(
    getAnimationDuration(prevProperties),
    getAnimationDuration(nextProperties),
    getTransitionMaskDuration(mask),
  );
};

export const toAnimationDisplayItem = (item) => {
  const animationType = getDialogType(item?.animation?.type);
  const duration =
    animationType === "transition"
      ? getTransitionTimelineDuration({
          prevProperties: getTransitionSideTween(item, "prev"),
          nextProperties: getTransitionSideTween(item, "next"),
          mask: item?.animation?.mask,
        })
      : getAnimationDuration(getUpdateAnimationTween(item));

  return {
    ...item,
    animationType,
    duration,
  };
};

export { getDialogType };
