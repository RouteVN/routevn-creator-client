import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { selectAboutPageCopy } from "./support/aboutPageCopy.js";

const social = [
  {
    id: "website",
    label: "Website",
    svg: "website",
    href: "https://routevn.com/creator/about",
  },
  {
    id: "discord",
    label: "Discord",
    svg: "discord",
    // TODO: replace with actual url when we have
    href: "https://routevn.com/discord",
  },
  {
    id: "reddit",
    label: "Reddit",
    svg: "reddit",
    href: "https://www.reddit.com/r/routevn",
  },
  {
    id: "bluesky",
    label: "BlueSky",
    svg: "bluesky",
    href: "https://bsky.app/profile/routevn.bsky.social",
  },
  {
    id: "x",
    label: "X",
    svg: "x-social",
    href: "https://x.com/routevn",
  },
];

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "about",
  repositoryTarget: "about",
  flatItems: [],
  appVersion: "",
  platform: "tauri",
  updatesEnabled: false,
  isTouchMode: false,
});

export const selectSocial = (_, payload) => {
  const { id } = payload;
  return social.find((s) => s.id === id);
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectAboutPageCopy(i18n);

  return {
    ...state,
    social,
    showExplorerPanel: !state.isTouchMode,
    contentPadding: state.isTouchMode ? "0" : "lg",
    contentBodyPadding: state.isTouchMode ? "md" : "0",
    contentBodyMarginTop: state.isTouchMode ? "0" : "lg",
    communityItemsDirection: state.isTouchMode ? "v" : "h",
    title: copy.title ?? "About",
    versionInformationTitle:
      copy.versionInformationTitle ?? "Version Information",
    appVersionText: formatI18nCopy(
      copy.appVersionText ?? "RouteVN Creator {appVersion}",
      {
        appVersion: state.appVersion,
      },
    ),
    checkForUpdatesButton: copy.checkForUpdatesButton ?? "Check for Updates",
    communityTitle: copy.communityTitle ?? "Community",
  };
};

export const selectState = ({ state }) => {
  return state;
};

export const setAppVersion = ({ state }, { version } = {}) => {
  state.appVersion = version;
};

export const setPlatform = ({ state }, { platform } = {}) => {
  state.platform = platform;
};

export const setUpdatesEnabled = ({ state }, { updatesEnabled } = {}) => {
  state.updatesEnabled = Boolean(updatesEnabled);
};

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};
