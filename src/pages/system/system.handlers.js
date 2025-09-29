export const handleTabClick =
  ({ setActiveTab, navigate }) =>
  (event) => {
    const tab = event.detail.data.item;

    if (!tab || !tab.path) {
      console.error("handleTabClick: Missing tab or path", event.detail);
      return;
    }

    setActiveTab(tab.id);
    navigate(tab.path);
  };
