export const handleTabClick =
  ({ setActiveTab, navigate }) =>
  (_event) => {
    const tab = _event.detail.data.item;

    if (!tab || !tab.path) {
      console.error("handleTabClick: Missing tab or path", _event.detail);
      return;
    }

    setActiveTab(tab.id);
    navigate(tab.path);
  };
