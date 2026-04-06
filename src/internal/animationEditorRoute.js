const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const resolveAnimationEditorPayload = (payload = {}) => {
  const animationId =
    getPayloadString(payload, "an") ?? getPayloadString(payload, "animationId");
  const targetGroupId =
    getPayloadString(payload, "ag") ?? getPayloadString(payload, "groupId");
  const dialogType =
    getPayloadString(payload, "at") === "transition"
      ? "transition"
      : "update";

  return {
    animationId,
    dialogType,
    targetGroupId: targetGroupId === "_root" ? undefined : targetGroupId,
  };
};

export const createAnimationEditorPayload = ({
  payload = {},
  animationId,
  dialogType,
  targetGroupId,
} = {}) => {
  const nextPayload = { ...payload };
  delete nextPayload.animationId;
  delete nextPayload.groupId;
  delete nextPayload.an;
  delete nextPayload.at;
  delete nextPayload.ag;

  if (animationId) {
    nextPayload.an = animationId;
    return nextPayload;
  }

  if (dialogType) {
    nextPayload.at = dialogType === "transition" ? "transition" : "update";
  }

  if (targetGroupId) {
    nextPayload.ag = targetGroupId;
  }

  return nextPayload;
};

export const getAnimationEditorBackPath = () => {
  return "/project/animations";
};
