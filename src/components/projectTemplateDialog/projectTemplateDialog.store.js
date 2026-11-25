import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  formatCalendarDate,
  formatDimensions,
  formatList,
} from "../../internal/dates.js";
import { PROJECT_LANGUAGES } from "../../internal/projectLanguage.js";
import { selectProjectLanguageLabel } from "../../internal/ui/projectLanguage.js";
import {
  BUNDLED_PROJECT_TEMPLATE_COVER_URL,
  BUNDLED_PROJECT_TEMPLATE_ID,
  createBundledProjectTemplate,
} from "../../internal/projectTemplates.js";
import {
  selectProjectTemplateCopy,
  selectProjectTemplateTitle,
} from "../../internal/ui/projectTemplates.js";

const LIST_STEP = "list";
const DETAIL_STEP = "detail";
const PLACEHOLDER_CARD_COUNT = 3;

export const createInitialState = () => ({
  open: false,
  step: LIST_STEP,
  catalog: {
    requestId: undefined,
    // `loading` while the first page loads, `ready` once a page is shown and
    // `failed` when the page asked for could not be loaded.
    status: "loading",
    templates: [],
    nextCursor: undefined,
    loadingCursor: undefined,
    failedCursor: undefined,
  },
  detail: {
    requestId: undefined,
    status: "loading",
    card: undefined,
    template: undefined,
    screenshotIndex: 0,
  },
});

export const selectCatalogRequestId = ({ state }) => state.catalog.requestId;

export const selectCatalogNextCursor = ({ state }) => state.catalog.nextCursor;

export const selectCatalogFailedCursor = ({ state }) =>
  state.catalog.failedCursor;

export const selectCatalogTemplateById = ({ state }, { templateId } = {}) =>
  state.catalog.templates.find(({ id }) => id === templateId);

export const selectDetailRequestId = ({ state }) => state.detail.requestId;

export const selectDetailTemplateId = ({ state }) => state.detail.card?.id;

export const selectDetailCard = ({ state }) => state.detail.card;

// The template the detail page shows: its loaded details, or its card while
// they load.
export const selectDetailTemplate = ({ state }) =>
  state.detail.template ?? state.detail.card;

export const selectScreenshotCount = ({ state }) =>
  state.detail.template?.screenshots.length ?? 0;

export const selectScreenshotIndex = ({ state }) =>
  state.detail.screenshotIndex;

const toCardView = (card, copy) => ({
  id: card.id,
  title: card.title,
  summary: card.summary,
  coverUrl: card.coverUrl,
  creatorName: card.creator.name,
  creatorAvatarUrl: card.creator.avatarUrl,
  openLabel: formatI18nCopy(copy.openTemplateLabel, { name: card.title }),
});

const formatLanguages = (languages, i18n) =>
  formatList(
    languages
      .filter((language) => PROJECT_LANGUAGES.includes(language))
      .map((language) => selectProjectLanguageLabel(i18n, language)),
    i18n.dateTime,
  );

const createDetailView = ({ state, i18n, copy }) => {
  const { detail } = state;
  const template = detail.template ?? detail.card;
  if (!template) return undefined;
  const dateTime = i18n.dateTime;
  const screenshots = (detail.template?.screenshots ?? []).map(
    (screenshot, index) => ({
      index,
      thumbnailUrl: screenshot.thumbnailUrl,
      alt: formatI18nCopy(copy.screenshotLabel, { number: index + 1 }),
      isSelected: index === detail.screenshotIndex,
    }),
  );
  const currentScreenshot =
    detail.template?.screenshots[detail.screenshotIndex];
  // While the details load, the card's cover stands in for the screenshots.
  // The viewer is 16:9 and shows each screenshot whole inside it.
  const viewerImage = currentScreenshot
    ? {
        url: currentScreenshot.url,
        alt: screenshots[detail.screenshotIndex].alt,
      }
    : {
        url: template.coverUrl,
        alt: template.title,
      };
  const isLoaded = detail.status === "ready";

  return {
    title: template.title,
    summary: template.summary,
    isLoading: detail.status === "loading",
    isFailed: detail.status === "failed",
    isLoaded,
    viewerImage,
    screenshots,
    hasMultipleScreenshots: screenshots.length > 1,
    description: detail.template?.description ?? [],
    creatorName: template.creator.name,
    creatorAvatarUrl: template.creator.avatarUrl,
    resolution: formatDimensions(
      template.resolution.width,
      template.resolution.height,
      dateTime,
    ),
    languages: formatLanguages(template.languages, i18n),
    versionName: detail.template?.versionName,
    released:
      template.releasedAt === undefined
        ? undefined
        : formatCalendarDate(template.releasedAt, dateTime),
    updated:
      detail.template?.updatedAt === undefined
        ? undefined
        : formatCalendarDate(detail.template.updatedAt, dateTime),
    useDisabled: !isLoaded,
  };
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectProjectTemplateCopy(i18n);
  const defaultTemplateTitle = selectProjectTemplateTitle(
    i18n,
    createBundledProjectTemplate(),
  );
  const { catalog } = state;
  const isCatalogLoading = catalog.status === "loading";

  return {
    open: state.open,
    isListStep: state.step === LIST_STEP,
    isDetailStep: state.step === DETAIL_STEP,
    dialogTitle: copy.title,
    closeLabel: copy.closeLabel,
    backLabel: copy.backButton,
    defaultTemplate: {
      id: BUNDLED_PROJECT_TEMPLATE_ID,
      title: defaultTemplateTitle,
      summary: copy.defaultTemplateSummary,
      coverUrl: BUNDLED_PROJECT_TEMPLATE_COVER_URL,
      openLabel: formatI18nCopy(copy.openTemplateLabel, {
        name: defaultTemplateTitle,
      }),
    },
    templates: catalog.templates.map((card) => toCardView(card, copy)),
    placeholderCards: isCatalogLoading
      ? Array.from({ length: PLACEHOLDER_CARD_COUNT }, (_, index) => index)
      : [],
    isCatalogLoading,
    catalogLoadingLabel: copy.templatesLoading,
    isCatalogFailed: catalog.status === "failed",
    catalogFailedLabel: copy.templatesLoadFailed,
    retryLabel: copy.retryButton,
    isLoadingMore: catalog.loadingCursor !== undefined,
    hasMoreTemplates:
      catalog.status === "ready" &&
      catalog.loadingCursor === undefined &&
      catalog.nextCursor !== undefined,
    loadMoreLabel: copy.loadMoreButton,
    detail: createDetailView({ state, i18n, copy }),
    detailLoadingLabel: copy.templateLoading,
    detailFailedLabel: copy.templateLoadFailed,
    previousScreenshotLabel: copy.previousScreenshotLabel,
    nextScreenshotLabel: copy.nextScreenshotLabel,
    creatorLabel: copy.creatorLabel,
    resolutionLabel: copy.resolutionLabel,
    languagesLabel: copy.languagesLabel,
    versionLabel: copy.versionLabel,
    releasedLabel: copy.releasedLabel,
    lastUpdatedLabel: copy.lastUpdatedLabel,
    useTemplateLabel: copy.useTemplateButton,
  };
};

// Opening the dialog starts again on the list, which reloads.
export const syncFromProps = ({ state }, { props } = {}) => {
  const open = props?.open === true;
  if (open && !state.open) {
    const initialState = createInitialState();
    state.step = initialState.step;
    state.catalog = initialState.catalog;
    state.detail = initialState.detail;
  }
  state.open = open;
};

// A first page clears the list; a later page keeps it and shows its loading
// under it.
export const startCatalogLoad = ({ state }, { requestId, cursor } = {}) => {
  state.catalog.requestId = requestId;
  state.catalog.failedCursor = undefined;
  if (cursor === undefined) {
    state.catalog.status = "loading";
    state.catalog.templates = [];
    state.catalog.nextCursor = undefined;
    state.catalog.loadingCursor = undefined;
    return;
  }
  state.catalog.loadingCursor = cursor;
};

export const setCatalogPage = ({ state }, { templates, nextCursor } = {}) => {
  state.catalog.status = "ready";
  state.catalog.templates.push(...templates);
  state.catalog.nextCursor = nextCursor;
  state.catalog.loadingCursor = undefined;
};

export const setCatalogError = ({ state }, { cursor } = {}) => {
  state.catalog.status = "failed";
  state.catalog.failedCursor = cursor;
  state.catalog.loadingCursor = undefined;
};

export const openDetail = ({ state }, { requestId, card } = {}) => {
  state.step = DETAIL_STEP;
  state.detail.requestId = requestId;
  state.detail.status = "loading";
  state.detail.card = card;
  state.detail.template = undefined;
  state.detail.screenshotIndex = 0;
};

export const setDetail = ({ state }, { template } = {}) => {
  state.detail.status = "ready";
  state.detail.template = template;
  state.detail.screenshotIndex = 0;
};

export const setDetailError = ({ state }) => {
  state.detail.status = "failed";
};

export const returnToList = ({ state }) => {
  state.step = LIST_STEP;
  state.detail.requestId = undefined;
};

export const setScreenshotIndex = ({ state }, { index } = {}) => {
  state.detail.screenshotIndex = index;
};

// Previous and next go around: after the last screenshot comes the first.
export const moveScreenshot = ({ state }, { offset } = {}) => {
  const count = state.detail.template?.screenshots.length ?? 0;
  if (count === 0) return;
  state.detail.screenshotIndex =
    (state.detail.screenshotIndex + offset + count) % count;
};
