export const handleAfterMount = (deps) => {
  const { store, projectService, render } = deps;
  const state = projectService.getState();

  // Extract images from repository state (raw data)
  const images = state.images || { items: {}, tree: [] };

  // Store raw images data - processing will happen in selectViewData
  store.setImages({ images: images });
  render();
};

export const handleImageItemClick = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;

  const id =
    payload._event.currentTarget?.dataset?.itemId ||
    payload._event.currentTarget?.id?.replace("imageItem", "");

  store.setSelectedImageId({
    imageId: id,
  });

  dispatchEvent(
    new CustomEvent("image-selected", {
      detail: {
        imageId: id,
      },
    }),
  );

  render();
};

export const handleScrollToItem = (deps, payload) => {
  const { refs } = deps;

  const { container } = refs;
  const { id } = payload;

  // Find the group element by stable data attribute.
  const groupElement = container.querySelector(`[data-group-id="${id}"]`);

  if (!groupElement) {
    return;
  }

  // Find all group elements to determine if this is the first one
  const allGroupElements = container.querySelectorAll("[data-group-id]");

  // Check if this is the first group element
  const isFirstGroup = allGroupElements[0] === groupElement;

  let targetScrollTop;

  if (isFirstGroup) {
    // If it's the first group, scroll to the very top (position 0)
    targetScrollTop = 0;
  } else {
    // Find the index of this group to calculate its expected position
    const groupIndex = Array.from(allGroupElements).indexOf(groupElement);

    // Calculate approximate position based on group index
    // This avoids issues with sticky positioning affecting getBoundingClientRect
    let estimatedPosition = 0;

    // Walk through all previous groups and sum their heights
    for (let i = 0; i < groupIndex; i++) {
      const prevGroup = allGroupElements[i];
      const prevGroupHeight = prevGroup.offsetHeight;
      estimatedPosition += prevGroupHeight;

      // Add space for the content between groups (images)
      const contentAfter = prevGroup.nextElementSibling;
      if (contentAfter) {
        estimatedPosition += contentAfter.offsetHeight;
      }
    }

    targetScrollTop = estimatedPosition;

    // Fallback: if estimation seems wrong, try the viewport method
    if (targetScrollTop <= 0) {
      const elementRect = groupElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      targetScrollTop =
        container.scrollTop + (elementRect.top - containerRect.top);
    }
  }

  // Always scroll if the difference is significant (more than 10px)
  const shouldScroll = Math.abs(container.scrollTop - targetScrollTop) > 10;

  if (shouldScroll) {
    container.scrollTo({
      top: targetScrollTop,
    });
  }
};
