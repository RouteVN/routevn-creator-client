const EMPTY_SRC = "";
const DEFAULT_LAZY_ROOT_MARGIN = "400px 0px";

const getFileIdFromProps = (attrs, projectService) => {
  if (attrs.fileId && attrs.imageId) {
    console.warn("[fileImage] invalid-props", {
      fileId: attrs.fileId,
      imageId: attrs.imageId,
    });
    return;
  }

  if (attrs.fileId) {
    return attrs.fileId;
  }

  if (attrs.imageId) {
    const repositoryState = projectService.getRepositoryState();
    const imageItem = repositoryState?.images?.items?.[attrs.imageId];
    if (!imageItem) {
      throw new Error(`Image with imageId "${attrs.imageId}" not found`);
    }

    const source = attrs.source ?? "original";
    if (source === "thumbnail") {
      return imageItem.thumbnailFileId ?? imageItem.fileId;
    }

    return imageItem.fileId;
  }

  return;
};

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }

    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

const isLazyEnabled = (attrs) => {
  return parseBooleanProp(attrs?.lazy);
};

const resolveLazyRootMargin = (attrs) => {
  const value = attrs?.lazyRootMargin;
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}px 0px`;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return DEFAULT_LAZY_ROOT_MARGIN;
};

const revokeBlobUrl = (src) => {
  if (typeof src !== "string" || !src.startsWith("blob:")) {
    return;
  }

  URL.revokeObjectURL(src);
};

const parseMarginValuePx = (value = "") => {
  const trimmedValue = value.trim();
  if (!trimmedValue.endsWith("px")) {
    return 0;
  }

  const numberValue = Number.parseFloat(trimmedValue.slice(0, -2));
  if (!Number.isFinite(numberValue)) {
    return 0;
  }

  return numberValue;
};

const parseRootMarginPx = (rootMargin) => {
  const parts = String(rootMargin || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const top = parseMarginValuePx(parts[0] ?? "0px");
  const right = parseMarginValuePx(parts[1] ?? parts[0] ?? "0px");
  const bottom = parseMarginValuePx(parts[2] ?? parts[0] ?? "0px");
  const left = parseMarginValuePx(parts[3] ?? parts[1] ?? parts[0] ?? "0px");

  return { top, right, bottom, left };
};

const getParentElement = (node) => {
  if (!node) {
    return;
  }

  if (node.parentElement instanceof HTMLElement) {
    return node.parentElement;
  }

  const rootNode = node.getRootNode?.();
  if (rootNode?.host instanceof HTMLElement) {
    return rootNode.host;
  }

  return;
};

const isScrollableElement = (element) => {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const styles = getComputedStyle(element);
  const overflowValue = `${styles.overflow} ${styles.overflowX} ${styles.overflowY}`;
  if (!/(auto|scroll|overlay)/.test(overflowValue)) {
    return false;
  }

  return (
    element.scrollHeight > element.clientHeight ||
    element.scrollWidth > element.clientWidth
  );
};

const resolveObserverRoot = (element) => {
  let currentElement = getParentElement(element);

  while (currentElement) {
    if (isScrollableElement(currentElement)) {
      return currentElement;
    }

    currentElement = getParentElement(currentElement);
  }

  return;
};

const isElementNearViewport = (element, root, rootMargin) => {
  if (!(element instanceof Element)) {
    return false;
  }

  const margin = parseRootMarginPx(rootMargin);
  const elementRect = element.getBoundingClientRect();
  const rootRect =
    root instanceof Element
      ? root.getBoundingClientRect()
      : {
          top: 0,
          right: window.innerWidth,
          bottom: window.innerHeight,
          left: 0,
        };

  return (
    elementRect.bottom >= rootRect.top - margin.top &&
    elementRect.top <= rootRect.bottom + margin.bottom &&
    elementRect.right >= rootRect.left - margin.left &&
    elementRect.left <= rootRect.right + margin.right
  );
};

const resetToPlaceholder = (store) => {
  const currentSrc = store.selectSrc();
  const isLoading = store.selectIsLoading();
  const loadedFileId = store.selectLoadedFileId();

  if (
    currentSrc === EMPTY_SRC &&
    loadedFileId === undefined &&
    isLoading === false
  ) {
    return false;
  }

  revokeBlobUrl(currentSrc);
  store.setSrc({ src: EMPTY_SRC });
  store.setIsLoading({ isLoading: false });
  store.setLoadedFileId({ fileId: undefined });
  return true;
};

const loadCurrentFile = async (deps, { attrs = deps.props } = {}) => {
  const { store, projectService, render } = deps;
  const fileId = getFileIdFromProps(attrs, projectService);
  const currentSrc = store.selectSrc();
  const loadedFileId = store.selectLoadedFileId();

  if (fileId && fileId === loadedFileId) {
    return;
  }

  if (!fileId) {
    resetToPlaceholder(store);
    render();
    return;
  }

  store.setIsLoading({ isLoading: true });
  render();

  try {
    const { url } = await projectService.getFileContent(fileId);
    const latestFileId = getFileIdFromProps(deps.props, projectService);

    if (latestFileId !== fileId) {
      revokeBlobUrl(url);
      return;
    }

    revokeBlobUrl(currentSrc);
    store.setSrc({ src: url });
    store.setLoadedFileId({ fileId });
    render();
  } catch (error) {
    console.error(error);
  } finally {
    store.setIsLoading({ isLoading: false });
    render();
  }
};

const startLazyLoadObservation = (deps, { phase = "mount" } = {}) => {
  const { refs, store, props: attrs, projectService, render } = deps;

  if (!isLazyEnabled(attrs) || store.selectShouldLoad()) {
    return false;
  }

  const fileId = getFileIdFromProps(attrs, projectService);
  if (!fileId) {
    return false;
  }

  if (store.selectIsLazyObserved()) {
    return true;
  }

  const target = refs.image;
  if (!target) {
    return false;
  }

  const rootMargin = resolveLazyRootMargin(attrs);
  const root = resolveObserverRoot(target);

  if (isElementNearViewport(target, root, rootMargin)) {
    store.setShouldLoad({ shouldLoad: true });
    render();
    void loadCurrentFile(deps, { phase });
    return true;
  }

  if (typeof IntersectionObserver !== "function") {
    store.setShouldLoad({ shouldLoad: true });
    render();
    void loadCurrentFile(deps, { phase });
    return true;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const isIntersecting = entries.some(
        (entry) => entry.isIntersecting || entry.intersectionRatio > 0,
      );
      if (!isIntersecting) {
        return;
      }

      observer.disconnect();
      store.setIsLazyObserved({ isLazyObserved: false });
      if (store.selectShouldLoad()) {
        return;
      }

      const currentFileId = getFileIdFromProps(deps.props, projectService);
      if (!currentFileId) {
        return;
      }

      store.setShouldLoad({ shouldLoad: true });
      render();
      void loadCurrentFile(deps, { phase });
    },
    {
      root,
      rootMargin,
      threshold: 0.01,
    },
  );

  store.setIsLazyObserved({ isLazyObserved: true });
  observer.observe(target);
  return true;
};

export const handleBeforeMount = (deps) => {
  const { store } = deps;
  store.setShouldLoad({ shouldLoad: false });
  store.setIsLazyObserved({ isLazyObserved: false });

  return () => {
    revokeBlobUrl(store.selectSrc());
  };
};

export const handleAfterMount = async (deps) => {
  const { store, props: attrs, projectService, render } = deps;
  const fileId = getFileIdFromProps(attrs, projectService);
  const lazyEnabled = isLazyEnabled(attrs);

  if (!lazyEnabled) {
    store.setShouldLoad({ shouldLoad: true });
    await loadCurrentFile(deps, { phase: "mount" });
    return;
  }

  if (fileId) {
    const didReset = resetToPlaceholder(store);
    if (didReset) {
      render();
    }

    if (startLazyLoadObservation(deps, { phase: "mount" })) {
      return;
    }

    store.setShouldLoad({ shouldLoad: true });
  }

  store.setShouldLoad({ shouldLoad: true });
  await loadCurrentFile(deps, { phase: "mount" });
};

export const handleOnUpdate = async (deps, payload) => {
  const { store, projectService, render } = deps;
  const { newProps: attrs } = payload;
  const fileId = getFileIdFromProps(attrs, projectService);
  const loadedFileId = store.selectLoadedFileId();
  const lazyEnabled = isLazyEnabled(attrs);

  if (fileId && fileId === loadedFileId) {
    return;
  }

  if (!fileId) {
    store.setShouldLoad({ shouldLoad: false });
    store.setIsLazyObserved({ isLazyObserved: false });
    resetToPlaceholder(store);
    render();
    return;
  }

  if (!lazyEnabled) {
    store.setShouldLoad({ shouldLoad: true });
    await loadCurrentFile(deps, {
      attrs,
      phase: "update",
      previousFileId: loadedFileId ?? "",
    });
    return;
  }

  store.setShouldLoad({ shouldLoad: false });
  store.setIsLazyObserved({ isLazyObserved: false });

  if (lazyEnabled) {
    const didReset = resetToPlaceholder(store);
    if (didReset) {
      render();
    }

    if (startLazyLoadObservation(deps, { phase: "update" })) {
      return;
    }

    store.setShouldLoad({ shouldLoad: true });
  }

  await loadCurrentFile(deps, {
    attrs,
  });
};
