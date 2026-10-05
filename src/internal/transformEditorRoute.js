const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const resolveTransformEditorPayload = (payload = {}) => ({
  transformId: getPayloadString(payload, "t"),
});

export const createTransformEditorPayload = ({
  payload = {},
  transformId,
} = {}) => {
  const nextPayload = { ...payload };
  delete nextPayload.t;

  if (transformId) {
    nextPayload.t = transformId;
  }

  return nextPayload;
};

export const getTransformEditorBackPath = () => "/project/transforms";
