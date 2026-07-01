export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  if (props?.selectedSoundId) {
    store.setSelectedSoundId({
      soundId: props.selectedSoundId,
    });
  }
};

export const handleAfterMount = (deps) => {
  const { store, projectService, render } = deps;
  const state = projectService.getRepositoryState();
  const sounds = state.sounds || { items: {}, tree: [] };

  store.setSounds({ sounds });
  render();
};

export const handleOnUpdate = (deps, payload) => {
  const { store, render } = deps;
  const newSelectedSoundId = payload?.newProps?.selectedSoundId;
  if (newSelectedSoundId !== undefined) {
    store.setSelectedSoundId({
      soundId: newSelectedSoundId,
    });
    render();
  }
};

export const handleSoundItemClick = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const soundId = payload._event.currentTarget?.dataset?.itemId;

  if (!soundId) {
    return;
  }

  store.setSelectedSoundId({
    soundId,
  });

  dispatchEvent(
    new CustomEvent("sound-selected", {
      detail: {
        soundId,
      },
    }),
  );

  render();
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
