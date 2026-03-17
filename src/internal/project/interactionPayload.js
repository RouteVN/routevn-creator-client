export const getInteractionPayload = (interaction = {}) => {
  if (!interaction || typeof interaction !== "object") {
    return {};
  }

  return interaction.payload ?? {};
};

export const getInteractionActions = (interaction = {}) => {
  return getInteractionPayload(interaction).actions ?? {};
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
  const nextValue = {
    ...interaction,
    payload,
  };

  return nextValue;
};
