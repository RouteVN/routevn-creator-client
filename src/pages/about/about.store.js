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
});

export const selectSocial = (_, payload) => {
  const { id } = payload;
  return social.find((s) => s.id === id);
};

export const selectViewData = ({ state }) => {
  return {
    ...state,
    social,
  };
};

export const selectState = ({ state }) => {
  return state;
};

export const setPlatform = (state, platform) => {
  state.platform = platform;
};

export const setAppVersion = (state, version) => {
  state.appVersion = version;
};
