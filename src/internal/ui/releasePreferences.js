export const ASSET_PACKAGE_ENABLED_CONFIG_KEY = "release.assetPackageEnabled";

export const isAssetPackageEnabled = (appService) =>
  appService.getUserConfig(ASSET_PACKAGE_ENABLED_CONFIG_KEY) === true;
