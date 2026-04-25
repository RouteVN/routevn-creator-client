const ROUTEVN_CREATOR_DOCS_BASE_URL = "https://routevn.com/creator/docs";

export const ROUTEVN_CREATOR_DOCS_URL = `${ROUTEVN_CREATOR_DOCS_BASE_URL}/introduction/`;
export const ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL = `${ROUTEVN_CREATOR_DOCS_BASE_URL}/page-index/`;

const creatorDocsPathByRoutePattern = {
  "/project": "/projects/",
  "/projects": "/projects/",
  "/project/images": "/images/",
  "/project/spritesheets": "/spritesheets/",
  "/project/characters": "/characters/",
  "/project/character-sprites": "/characters/#character-sprites",
  "/project/sounds": "/sounds/",
  "/project/transforms": "/transforms/",
  "/project/animations": "/animations/",
  "/project/animation-editor": "/animations/#animation-editor-page",
  "/project/particles": "/particles/",
  "/project/videos": "/videos/",
  "/project/colors": "/colors/",
  "/project/text-styles": "/text-styles/",
  "/project/controls": "/controls/",
  "/project/variables": "/variables/",
  "/project/scenes": "/scene-map/",
  "/project/scene-editor": "/scene-editor/",
  "/project/fonts": "/fonts/",
  "/project/layouts": "/layouts/",
  "/project/layout-editor": "/layouts/#layout-editor",
  "/project/releases": "/versions/",
  "/project/releases/versions": "/versions/",
  "/project/releases/web-server": "/web-server/",
  "/project/about": "/page-index/#settings",
  "/project/appearance": "/page-index/#settings",
  "/project/user": "/page-index/#settings",
};

const creatorDocsPathBySystemActionMode = {
  actions: "/scene-editor/",
  hidden: "/page-index/",
  dialogue: "/line-actions/dialogue/",
  choice: "/line-actions/choices/",
  background: "/line-actions/background/",
  bgm: "/line-actions/bgm/",
  sfx: "/line-actions/sfx/",
  character: "/line-actions/characters/",
  visual: "/line-actions/visual/",
  sectionTransition: "/line-actions/section-transition/",
  resetStoryAtSection: "/line-actions/section-transition/",
  control: "/line-actions/controls/",
  nextLine: "/line-actions/next-line/",
  toggleAutoMode: "/line-actions/toggle-auto-mode/",
  toggleSkipMode: "/line-actions/toggle-skip-mode/",
  toggleDialogueUI: "/line-actions/dialogue/",
  setDialogueTextSpeed: "/line-actions/dialogue/",
  pushOverlay: "/line-actions/visual/",
  popOverlay: "/line-actions/visual/",
  rollbackByOffset: "/line-actions/next-line/",
  showConfirmDialog: "/line-actions/controls/",
  hideConfirmDialog: "/line-actions/controls/",
  saveSlot: "/line-actions/controls/",
  loadSlot: "/line-actions/controls/",
  setNextLineConfig: "/line-actions/next-line-config/",
  setSaveLoadPagination: "/line-actions/controls/",
  incrementSaveLoadPagination: "/line-actions/controls/",
  decrementSaveLoadPagination: "/line-actions/controls/",
  setSoundVolume: "/line-actions/sfx/",
  setMusicVolume: "/line-actions/bgm/",
  setMuteAll: "/line-actions/bgm/",
  setMenuPage: "/line-actions/controls/",
  setMenuEntryPoint: "/line-actions/controls/",
  updateVariable: "/line-actions/update-variable/",
};

const normalizeRoutePattern = (routePattern) => {
  if (typeof routePattern !== "string" || routePattern.length === 0) {
    return undefined;
  }

  if (routePattern.length > 1) {
    return routePattern.replace(/\/+$/, "");
  }

  return routePattern;
};

const normalizeMode = (mode) => {
  if (typeof mode !== "string" || mode.length === 0) {
    return undefined;
  }

  return mode;
};

export const getRoutevnCreatorDocsUrl = (routePattern) => {
  const normalizedRoutePattern = normalizeRoutePattern(routePattern);
  const docsPath = creatorDocsPathByRoutePattern[normalizedRoutePattern];

  if (!docsPath) {
    return ROUTEVN_CREATOR_DOCS_URL;
  }

  return `${ROUTEVN_CREATOR_DOCS_BASE_URL}${docsPath}`;
};

export const getRoutevnCreatorSystemActionDocsUrl = (mode) => {
  const normalizedMode = normalizeMode(mode);
  const docsPath = creatorDocsPathBySystemActionMode[normalizedMode];

  if (!docsPath) {
    return ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL;
  }

  return `${ROUTEVN_CREATOR_DOCS_BASE_URL}${docsPath}`;
};
