/**
 * Check whether the currently focused element is an actionable element within the provided root.
 * Traverses into shadow DOMs to find the deep active element so we can ignore focus on document-level containers.
 *
 * @param {Document|ShadowRoot} [root=document] - Root node whose focused element should be inspected.
 * @returns {boolean} `true` when an element other than the body or dialog has focus, otherwise `false`.
 */
const isInputFocused = (root = document) => {
  let active = root.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  if (active) {
    const tagName = active.tagName;
    if (!["BODY", "DIALOG"].includes(tagName)) {
      return true;
    }
  }
  return false;
};

export default isInputFocused;
