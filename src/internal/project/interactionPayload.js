import { normalizeLineActions } from "./engineActions.js";

export const getInteractionPayload = (interaction = {}) => {
  if (!interaction || typeof interaction !== "object") {
    return {};
  }

  return interaction.payload ?? {};
};

export const getInteractionActions = (interaction = {}) => {
  return normalizeLineActions(getInteractionPayload(interaction).actions ?? {});
};

export const withInteractionPayload = (interaction = {}, payload = {}) => {
  const nextInteraction =
    interaction && typeof interaction === "object" ? { ...interaction } : {};

  return {
    ...nextInteraction,
    payload,
  };
};

export const normalizeInteractionValue = (interaction = {}) => {
  if (!interaction || typeof interaction !== "object") {
    return interaction;
  }

  const payload = getInteractionPayload(interaction);
  const nextValue = {};
  Object.entries(interaction).forEach(([key, value]) => {
    if (key !== "payload") {
      nextValue[key] = value;
    }
  });
  nextValue.payload = payload;

  return nextValue;
};
