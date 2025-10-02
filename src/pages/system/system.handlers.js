export const handleTabClick =
  ({ setActiveTab, navigate }) =>
  (event) => {
    const tab = payload._event.detail.data.item;

    if (!tab || !tab.path) {
      console.error("handleTabClick: Missing tab or path", payload._event.detail);
      return;
    }

    setActiveTab(tab.id);
    navigate(tab.path);
  };
