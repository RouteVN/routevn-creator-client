const getPayloadString = (payload, key) => {
  const value = payload?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const resolveAudioEffectsEditorPayload = (payload = {}) => ({
  audioEffectId:
    getPayloadString(payload, "aef") ??
    getPayloadString(payload, "audioEffectId"),
});

export const createAudioEffectsEditorPayload = ({
  payload = {},
  audioEffectId,
} = {}) => {
  const nextPayload = { ...payload };
  delete nextPayload.aef;
  delete nextPayload.audioEffectId;

  if (audioEffectId) {
    nextPayload.aef = audioEffectId;
  }

  return nextPayload;
};

export const getAudioEffectsEditorBackPath = () => "/project/audio-effects";
