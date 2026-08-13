const isTextareaTarget = (element) =>
  element.tagName === "TEXTAREA" || element.tagName === "RTGL-TEXTAREA";

const isSectionActionTarget = (element) =>
  Boolean(element.dataset?.sectionActionId);

export const shouldSubmitFormOnEnter = (event) => {
  if (event.key !== "Enter" || event.shiftKey) {
    return false;
  }

  return !event
    .composedPath()
    .some(
      (element) => isTextareaTarget(element) || isSectionActionTarget(element),
    );
};

export const forwardFormSubmitOnEnter = async ({ deps, payload, submit }) => {
  const event = payload._event;
  if (!shouldSubmitFormOnEnter(event)) {
    return false;
  }

  event.preventDefault();
  await submit(deps);
  return true;
};
