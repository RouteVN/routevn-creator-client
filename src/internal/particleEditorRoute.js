const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const resolveParticleEditorPayload = (payload = {}) => ({
  particleId: getPayloadString(payload, "pt"),
});

export const createParticleEditorPayload = ({
  payload = {},
  particleId,
} = {}) => {
  const nextPayload = { ...payload };
  delete nextPayload.pt;

  if (particleId) {
    nextPayload.pt = particleId;
  }

  return nextPayload;
};

export const getParticleEditorBackPath = () => "/project/particles";
