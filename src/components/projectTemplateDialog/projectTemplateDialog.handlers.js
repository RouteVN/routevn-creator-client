import { generateId } from "../../internal/id.js";
import {
  BUNDLED_PROJECT_TEMPLATE_ID,
  createBundledProjectTemplate,
  createStoreProjectTemplate,
} from "../../internal/projectTemplates.js";

// Loads the first page of templates, or the page after `cursor`. A response
// that arrives after a newer request, or after the dialog reopened, is
// dropped.
const loadCatalog = async (deps, { cursor } = {}) => {
  const { appService, store, render } = deps;
  const requestId = generateId();
  store.startCatalogLoad({ requestId, cursor });
  render();
  try {
    const page = await appService.listProjectTemplates({ cursor });
    if (store.selectCatalogRequestId() !== requestId) return;
    store.setCatalogPage({
      templates: page.templates,
      nextCursor: page.nextCursor,
    });
  } catch {
    if (store.selectCatalogRequestId() !== requestId) return;
    store.setCatalogError({ cursor });
  }
  render();
};

const emitTemplateSelect = ({ dispatchEvent }, template) => {
  dispatchEvent(
    new CustomEvent("template-select", {
      detail: { template },
    }),
  );
};

// The template's page opens at once from its card, then loads its
// description and screenshots. A response for a template the user has left
// is dropped.
const openTemplate = async (deps, templateId) => {
  const { appService, store, render } = deps;
  const requestId = generateId();
  store.openDetail({
    requestId,
    card: store.selectCatalogTemplateById({ templateId }),
  });
  render();
  let template;
  try {
    template = await appService.getProjectTemplate({ templateId });
  } catch {
    if (store.selectDetailRequestId() !== requestId) return;
    store.setDetailError();
    render();
    return;
  }
  if (store.selectDetailRequestId() !== requestId) return;
  store.setDetail({ template });
  render();
};

// The bundled template has no page: choosing it is enough.
const chooseCard = (deps, templateId) => {
  if (templateId === BUNDLED_PROJECT_TEMPLATE_ID) {
    emitTemplateSelect(deps, createBundledProjectTemplate());
    return undefined;
  }
  return openTemplate(deps, templateId);
};

const isActivationKey = (_event) =>
  _event.key === "Enter" || _event.key === " ";

const findTemplateCard = (_event) =>
  _event
    .composedPath()
    .find((target) => target?.dataset?.templateId !== undefined);

const findScreenshotThumbnail = (_event) =>
  _event
    .composedPath()
    .find((target) => target?.dataset?.screenshotIndex !== undefined);

export const handleBeforeMount = (deps) => {
  const { store, props } = deps;
  store.syncFromProps({ props });
  if (props.open === true) loadCatalog(deps);
};

export const handleOnUpdate = (deps, payload = {}) => {
  const { store, render } = deps;
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};
  if (oldProps.open === newProps.open) return undefined;
  store.syncFromProps({ props: newProps });
  if (newProps.open === true) return loadCatalog(deps);
  render();
  return undefined;
};

export const handleTemplateGridClick = (deps, payload) => {
  const card = findTemplateCard(payload._event);
  if (!card) return undefined;
  return chooseCard(deps, card.dataset.templateId);
};

export const handleTemplateGridKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (!isActivationKey(_event)) return undefined;
  const card = findTemplateCard(_event);
  if (!card) return undefined;
  _event.preventDefault();
  return chooseCard(deps, card.dataset.templateId);
};

export const handleCatalogRetry = (deps) => {
  const { store } = deps;
  return loadCatalog(deps, { cursor: store.selectCatalogFailedCursor() });
};

export const handleLoadMoreTemplates = (deps) => {
  const { store } = deps;
  return loadCatalog(deps, { cursor: store.selectCatalogNextCursor() });
};

export const handleDetailBack = (deps) => {
  const { store, render } = deps;
  store.returnToList();
  render();
};

export const handleDetailRetry = (deps) => {
  const { store } = deps;
  return openTemplate(deps, store.selectDetailTemplateId());
};

export const handleScreenshotThumbnailClick = (deps, payload) => {
  const { store, render } = deps;
  const thumbnail = findScreenshotThumbnail(payload._event);
  if (!thumbnail) return;
  store.setScreenshotIndex({
    index: Number(thumbnail.dataset.screenshotIndex),
  });
  render();
};

export const handleScreenshotThumbnailKeyDown = (deps, payload) => {
  const { _event } = payload;
  if (!isActivationKey(_event)) return;
  _event.preventDefault();
  handleScreenshotThumbnailClick(deps, payload);
};

export const handlePreviousScreenshotClick = (deps) => {
  const { store, render } = deps;
  store.moveScreenshot({ offset: -1 });
  render();
};

export const handleNextScreenshotClick = (deps) => {
  const { store, render } = deps;
  store.moveScreenshot({ offset: 1 });
  render();
};

// Left and Right move through the screenshots in the direction they are laid
// out, which right-to-left languages reverse.
export const handleScreenshotViewerKeyDown = (deps, payload) => {
  const { store, render } = deps;
  const { _event } = payload;
  if (_event.key !== "ArrowLeft" && _event.key !== "ArrowRight") return;
  if (store.selectScreenshotCount() < 2) return;
  _event.preventDefault();
  const towardsEnd = _event.key === "ArrowRight";
  const isRtl = _event.currentTarget.matches(":dir(rtl)");
  store.moveScreenshot({ offset: towardsEnd !== isRtl ? 1 : -1 });
  render();
};

// The form draws the template's cover small, so it takes the card's cover,
// which is read small, with the page's loaded details.
export const handleUseTemplateClick = (deps) => {
  const { store } = deps;
  const template = createStoreProjectTemplate(store.selectDetailTemplate());
  template.coverUrl = store.selectDetailCard().coverUrl;
  emitTemplateSelect(deps, template);
};

export const handleDialogClose = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("close"));
};
