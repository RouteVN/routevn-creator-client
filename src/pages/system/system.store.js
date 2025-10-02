export const createInitialState = () => ({
  tabs: [
    {
      id: "variables",
      name: "Variables",
      path: "/project/resources/variables",
    },
  ],
  activeTab: "variables",
});

export const setActiveTab = (state, tabId) => {
  state.activeTab = tabId;
};

export const selectViewData = ({ state }) => {
  const currentPath =
    typeof window !== "undefined" ? window.location.pathname : "";

  // Determine active tab based on current path
  let activeTab = state.activeTab;

  if (currentPath.includes("/resources/variables")) {
    activeTab = "variables";
  }

  return {
    tabs: state.tabs,
    activeTab,
    actions: [], // Add empty actions array for systemActions component
  };
};
