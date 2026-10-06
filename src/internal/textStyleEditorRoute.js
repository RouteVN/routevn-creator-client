const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const resolveTextStyleEditorPayload = (payload = {}) => ({
  textStyleId: getPayloadString(payload, "ts"),
});

export const createTextStyleEditorPayload = ({
  payload = {},
  textStyleId,
} = {}) => {
  const nextPayload = { ...payload };
  delete nextPayload.ts;

  if (textStyleId) {
    nextPayload.ts = textStyleId;
  }

  return nextPayload;
};

export const getTextStyleEditorBackPath = () => "/project/text-styles";
