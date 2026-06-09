export const handleBeforeMount = (deps) => {
  const { props, store } = deps;
  if (props?.selectedSpritesheetValue) {
    store.setSelectedSpritesheetValue({
      selectedSpritesheetValue: props.selectedSpritesheetValue,
    });
  }
};

export const handleAfterMount = (deps) => {
  const { projectService, render, store } = deps;
  const state = projectService.getRepositoryState();
  store.setSpritesheets({
    spritesheets: state.spritesheets || { items: {}, tree: [] },
  });
  render();
};

export const handleOnUpdate = (deps, payload) => {
  const { render, store } = deps;
  const selectedSpritesheetValue = payload?.newProps?.selectedSpritesheetValue;
  if (selectedSpritesheetValue !== undefined) {
    store.setSelectedSpritesheetValue({
      selectedSpritesheetValue,
    });
    render();
  }
};

const dispatchSpritesheetSelection = (deps, eventName, itemElement) => {
  const { dispatchEvent } = deps;
  const selectionValue = itemElement?.dataset?.selectionValue;
  const resourceId = itemElement?.dataset?.resourceId;
  const animationName = itemElement?.dataset?.animationName;

  if (!selectionValue || !resourceId || !animationName) {
    return;
  }

  dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        value: selectionValue,
        resourceId,
        animationName,
      },
    }),
  );
};

export const handleSpritesheetItemClick = (deps, payload) => {
  const { render, store } = deps;
  const itemElement = payload._event.currentTarget;
  const selectedSpritesheetValue = itemElement?.dataset?.selectionValue;

  if (!selectedSpritesheetValue) {
    return;
  }

  store.setSelectedSpritesheetValue({
    selectedSpritesheetValue,
  });
  dispatchSpritesheetSelection(deps, "spritesheet-selected", itemElement);
  render();
};

export const handleSpritesheetItemDoubleClick = (deps, payload) => {
  dispatchSpritesheetSelection(
    deps,
    "spritesheet-dblclick",
    payload._event.currentTarget,
  );
};

export const handleScrollToItem = (deps, payload) => {
  const { refs } = deps;
  const { container } = refs;
  const id = payload.itemId ?? payload.id;

  if (!container || !id) {
    return;
  }

  const groupElement = container.querySelector(`[data-group-id="${id}"]`);
  if (!groupElement) {
    return;
  }

  const allGroupElements = container.querySelectorAll("[data-group-id]");
  const isFirstGroup = allGroupElements[0] === groupElement;
  let targetScrollTop;

  if (isFirstGroup) {
    targetScrollTop = 0;
  } else {
    const groupIndex = Array.from(allGroupElements).indexOf(groupElement);
    let estimatedPosition = 0;

    for (let index = 0; index < groupIndex; index += 1) {
      const previousGroup = allGroupElements[index];
      estimatedPosition += previousGroup.offsetHeight;

      const contentAfter = previousGroup.nextElementSibling;
      if (contentAfter) {
        estimatedPosition += contentAfter.offsetHeight;
      }
    }

    targetScrollTop = estimatedPosition;

    if (targetScrollTop <= 0) {
      const elementRect = groupElement.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      targetScrollTop =
        container.scrollTop + (elementRect.top - containerRect.top);
    }
  }

  const shouldScroll = Math.abs(container.scrollTop - targetScrollTop) > 10;
  if (shouldScroll) {
    container.scrollTo({
      top: targetScrollTop,
    });
  }
};
