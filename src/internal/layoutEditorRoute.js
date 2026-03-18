const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const resolveLayoutEditorPayload = (payload = {}) => {
  const controlId = getPayloadString(payload, "c");
  const layoutId = getPayloadString(payload, "l");
  const legacyLayoutId = getPayloadString(payload, "layoutId");

  const selectedLayoutId = controlId ?? layoutId ?? legacyLayoutId;
  const resourceType = controlId ? "controls" : "layouts";

  return {
    layoutId: selectedLayoutId,
    resourceType,
    payloadKey: resourceType === "controls" ? "c" : "l",
  };
};

export const createLayoutEditorPayload = ({
  payload = {},
  layoutId,
  resourceType = "layouts",
} = {}) => {
  const nextPayload = { ...payload };
  delete nextPayload.layoutId;
  delete nextPayload.l;
  delete nextPayload.c;

  if (layoutId) {
    nextPayload[resourceType === "controls" ? "c" : "l"] = layoutId;
  }

  return nextPayload;
};

export const getLayoutEditorBackPath = (payload = {}) => {
  const { resourceType } = resolveLayoutEditorPayload(payload);
  return resourceType === "controls" ? "/project/controls" : "/project/layouts";
};
