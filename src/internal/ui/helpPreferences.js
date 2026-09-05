export const HELP_BUTTON_VISIBLE_CONFIG_KEY = "app.showHelpButton";

export const isHelpButtonVisible = (appService) =>
  appService.getUserConfig(HELP_BUTTON_VISIBLE_CONFIG_KEY) !== false;
