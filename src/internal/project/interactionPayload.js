export const getInteractionPayload = (interaction = {}) => {
  if (!interaction || typeof interaction !== "object") {
    return {};
  }

  return interaction.payload ?? interaction.actionPayload ?? {};
};

export const getInteractionActions = (interaction = {}) => {
  return getInteractionPayload(interaction).actions ?? {};
};

export const withInteractionPayload = (interaction = {}, payload = {}) => {
  const nextInteraction =
    interaction && typeof interaction === "object" ? { ...interaction } : {};

  const nextValue = {
    ...nextInteraction,
    payload,
  };

  delete nextValue.actionPayload;

  return nextValue;
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

  delete nextValue.actionPayload;

  return nextValue;
};
