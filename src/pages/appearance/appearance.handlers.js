export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;

  store.setCurrentTheme({
    theme: appService.getTheme(),
  });
};

export const handleDataChanged = () => {
  // Handle file explorer data changes
};

export const handleThemeCardClick = (deps, payload) => {
  const { appService, render, store } = deps;
  const { _event } = payload;
  const theme = _event.currentTarget?.dataset?.theme;
  const currentTheme = store.selectState().currentTheme;

  if (!theme || theme === currentTheme) {
    return;
  }

  const nextTheme = appService.setTheme(theme);
  store.setCurrentTheme({ theme: nextTheme });
  render();
};
