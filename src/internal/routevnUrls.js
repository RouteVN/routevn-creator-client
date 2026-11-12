const ROUTEVN_CREATOR_DOCS_BASE_URL = "https://routevn.com/en/creator/docs";

export const ROUTEVN_CONTACT_URL = "https://routevn.com/en/contact/";
// Chat support channels, offered on About and from the help button.
export const ROUTEVN_WHATSAPP_URL = "https://wa.me/6589113417";
export const ROUTEVN_TELEGRAM_URL = "https://t.me/routevn";
export const ROUTEVN_DISCORD_URL = "https://discord.gg/8J9dyZSu9C";
export const ROUTEVN_CONTACT_EMAIL_URL = "mailto:contact@routevn.com";
export const ROUTEVN_CREATOR_APP_STORE_URL =
  "https://apps.apple.com/sg/app/id6810571721";
export const ROUTEVN_CREATOR_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.routevn.creator";
// Direct Android builds only open update downloads on this domain or its subdomains.
export const ROUTEVN_DOWNLOAD_DOMAIN = "routevn.com";
export const ROUTEVN_CREATOR_DOCS_URL = `${ROUTEVN_CREATOR_DOCS_BASE_URL}/introduction/`;
export const ROUTEVN_CREATOR_DOCS_PAGE_INDEX_URL = `${ROUTEVN_CREATOR_DOCS_BASE_URL}/page-index/`;

const creatorDocsPathByRoutePattern = {
  "/project": "/projects/#project-details",
  "/projects": "/projects/",
  "/project/images": "/images/",
  "/project/spritesheets": "/spritesheets/",
  "/project/characters": "/characters/",
  "/project/character-sprites": "/characters/#character-sprites",
  "/project/sounds": "/sounds/",
  "/project/transforms": "/transforms/",
  "/project/transform-editor": "/transforms/#parts-of-the-transform-editor",
  "/project/animations": "/animations/",
  "/project/animation-editor": "/animations/#parts-of-the-animation-editor",
  "/project/audio-effects": "/audio-effects/",
  "/project/audio-effects-editor": "/audio-effects/#audio-effect-editor",
  "/project/particles": "/particles/",
  "/project/particle-editor": "/particles/#parts-of-the-particle-editor",
  "/project/videos": "/videos/",
  "/project/colors": "/colors/",
  "/project/text-styles": "/text-styles/",
  "/project/text-style-editor": "/text-styles/",
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
  "/project/releases/platform-details": "/platform-details/",
  "/project/about": "/settings/#about",
  "/project/config": "/settings/#config",
  "/project/tutorials": "/video-tutorials/",
  "/project/appearance": "/settings/#config",
  "/project/language": "/settings/#config",
  "/project/asset-package": "/page-index/#release",
  "/project/asset-packs": "/page-index/#release",
  "/project/asset-pack-editor": "/page-index/#release",
  "/project/user": "/settings/",
};

// Pages with their own docs for phones and tablets, used in touch mode.
const creatorTouchDocsPathByRoutePattern = {
  "/project/tutorials": "/video-tutorials-mobile/",
};

const creatorDocsPathBySystemActionMode = {
  actions: "/scene-editor/#add-an-action-to-a-line",
  hidden: "/page-index/",
  dialogue: "/line-actions/dialogue/",
  choice: "/line-actions/choices/",
  // Screen has no page of its own yet.
  screen: "/scene-editor/#add-an-action-to-a-line",
  background: "/line-actions/background/",
  bgm: "/line-actions/bgm/",
  voice: "/line-actions/voice/",
  sfx: "/line-actions/sfx/",
  character: "/line-actions/characters/",
  visual: "/line-actions/visuals/",
  sectionTransition: "/line-actions/section-transition/",
  resetStoryAtSection: "/line-actions/reset-story-at-section/",
  control: "/line-actions/controls/",
  nextLine: "/line-actions/next-line/",
  toggleAutoMode: "/line-actions/toggle-auto-mode/",
  toggleSkipMode: "/line-actions/toggle-skip-mode/",
  startSkipMode: "/line-actions/toggle-skip-mode/",
  stopSkipMode: "/line-actions/toggle-skip-mode/",
  toggleDialogueUI: "/line-actions/dialogue/",
  setDialogueTextSpeed: "/line-actions/dialogue/",
  pushOverlay: "/line-actions/push-layered-view/",
  popOverlay: "/line-actions/pop-layered-view/",
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
  setAutoForwardDelay: "/line-actions/toggle-auto-mode/",
  setSkipUnseenText: "/line-actions/toggle-skip-mode/",
  setSkipTransitionsAndAnimations: "/line-actions/toggle-skip-mode/",
  updateVariable: "/line-actions/update-variable/",
  input: "/line-actions/input/",
  conditional: "/line-actions/conditional/",
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

export const getRoutevnCreatorDocsUrl = (
  routePattern,
  { isTouchMode = false } = {},
) => {
  const normalizedRoutePattern = normalizeRoutePattern(routePattern);
  const touchDocsPath = isTouchMode
    ? creatorTouchDocsPathByRoutePattern[normalizedRoutePattern]
    : undefined;
  const docsPath =
    touchDocsPath ?? creatorDocsPathByRoutePattern[normalizedRoutePattern];

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
