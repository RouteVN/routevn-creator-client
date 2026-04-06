const getDialogType = (animationType) => {
  return animationType === "transition" ? "transition" : "update";
};

const getAnimationTypeLabel = (animationType) => {
  return getDialogType(animationType) === "transition"
    ? "Transition"
    : "Update";
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

const getAnimationDuration = (tween = {}) => {
  return Object.values(tween).reduce((maxDuration, propertyConfig) => {
    const totalDuration = (propertyConfig?.keyframes ?? []).reduce(
      (sum, keyframe) => {
        return sum + (Number(keyframe?.duration) || 0);
      },
      0,
    );

    return Math.max(maxDuration, totalDuration);
  }, 0);
};

export const getTransitionTimelineDuration = ({
  prevProperties = {},
  nextProperties = {},
} = {}) => {
  return Math.max(
    getAnimationDuration(prevProperties),
    getAnimationDuration(nextProperties),
  );
};

export const toAnimationDisplayItem = (item) => {
  const animationType = getDialogType(item?.animation?.type);
  const prevProperties = structuredClone(getTransitionSideTween(item, "prev"));
  const nextProperties = structuredClone(getTransitionSideTween(item, "next"));
  const updateProperties = structuredClone(getUpdateAnimationTween(item));
  const propertyCount =
    animationType === "transition"
      ? Object.keys(prevProperties).length + Object.keys(nextProperties).length
      : Object.keys(updateProperties).length;
  const transitionTimelineDuration =
    animationType === "transition"
      ? getTransitionTimelineDuration({
          prevProperties,
          nextProperties,
        })
      : 0;
  const duration =
    animationType === "transition"
      ? Math.max(
          getAnimationDuration(getTransitionSideTween(item, "prev")),
          getAnimationDuration(getTransitionSideTween(item, "next")),
        )
      : getAnimationDuration(getUpdateAnimationTween(item));

  return {
    ...item,
    animationType,
    animationTypeLabel: getAnimationTypeLabel(item?.animation?.type),
    updateProperties,
    prevProperties,
    nextProperties,
    transitionTimelineDuration,
    propertyCount,
    duration,
    cardKind: "animation",
    itemWidth: "f",
  };
};

export const formatAnimationDurationLabel = (durationMs) => {
  const resolvedDurationMs = Number(durationMs) || 0;
  if (resolvedDurationMs < 1000) {
    return `${resolvedDurationMs}ms`;
  }

  const durationSeconds = resolvedDurationMs / 1000;
  if (Number.isInteger(durationSeconds)) {
    return `${durationSeconds}s`;
  }

  return `${Number(durationSeconds.toFixed(durationSeconds < 10 ? 1 : 2))}s`;
};

export { getDialogType };
