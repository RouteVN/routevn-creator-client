// A layout edited over the scene it is shown in, such as a visual's layout
// over its line, is drawn in a backdrop made from the scene's render state.
// The backdrop keeps the scene's elements in their order, and the place of the
// edited layout in it, so the layout is drawn above what is below it on the
// screen and below what is above it.

// The place in a backdrop where the edited layout is drawn.
export const LAYOUT_EDITOR_SCENE_SLOT_ID = "layout-editor-scene-slot";

// What an element does when it is used. The backdrop is only shown.
const INTERACTION_FIELDS = [
  "click",
  "rightClick",
  "hover",
  "scrollUp",
  "scrollDown",
  "change",
  "submit",
  "drag",
  "dragStart",
  "dragMove",
  "dragEnd",
];

// Where the edited layout is drawn: the place of the element it replaces,
// such as a visual's container, without how that element looks.
const SLOT_PLACEMENT_FIELDS = [
  "x",
  "y",
  "width",
  "height",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "originX",
  "originY",
];

const createSceneSlot = (replacedElement = {}) => {
  const slot = {
    id: LAYOUT_EDITOR_SCENE_SLOT_ID,
    type: "container",
    x: 0,
    y: 0,
  };
  for (const field of SLOT_PLACEMENT_FIELDS) {
    if (replacedElement[field] !== undefined) {
      slot[field] = replacedElement[field];
    }
  }
  return slot;
};

const toBackdropElements = (elements = [], replacedElementId, found) =>
  elements.map((element) => {
    if (element.id === replacedElementId) {
      found.value = true;
      return createSceneSlot(element);
    }

    const backdropElement = { ...element };
    for (const field of INTERACTION_FIELDS) {
      delete backdropElement[field];
    }
    if (Array.isArray(element.children)) {
      backdropElement.children = toBackdropElements(
        element.children,
        replacedElementId,
        found,
      );
    }
    return backdropElement;
  });

// The backdrop for a layout edited in a scene: the scene's rendered elements,
// shown only, with the element of the edited layout, `replacedElementId`,
// replaced by the slot the editor draws the layout in, placed as that element
// was. A scene without that element gets the slot above everything else.
export const createLayoutEditorSceneBackdrop = (
  elements = [],
  { replacedElementId } = {},
) => {
  const found = { value: false };
  const backdrop = toBackdropElements(
    structuredClone(elements),
    replacedElementId,
    found,
  );
  if (!found.value) {
    backdrop.push(createSceneSlot());
  }
  return backdrop;
};

const placeInSlot = (elements, layoutElements) =>
  elements.map((element) => {
    if (element.id === LAYOUT_EDITOR_SCENE_SLOT_ID) {
      return { ...element, children: layoutElements };
    }
    if (!Array.isArray(element.children)) {
      return element;
    }
    return {
      ...element,
      children: placeInSlot(element.children, layoutElements),
    };
  });

// The elements the editor draws: the backdrop with the edited layout's
// elements in its slot, or the layout's elements alone without a backdrop.
export const placeLayoutInSceneBackdrop = (backdrop, layoutElements) => {
  if (!Array.isArray(backdrop) || backdrop.length === 0) {
    return layoutElements;
  }
  return placeInSlot(backdrop, layoutElements);
};
