import { formatI18nCopy } from "./i18nCopy.js";

export const formatLoadingProgress = (
  progress = {},
  copy = {},
  includeAsset = true,
) => {
  const { stage, completed = 0, total = 0, assetName = "" } = progress;
  const defaults = {
    repository: "Opening project...",
    scenes: "Preparing scenes...",
    graphics: "Initializing graphics...",
    reading: "Checking assets: {completed} / {total}",
    decoding: "Loading assets: {completed} / {total}",
    engine: "Starting playback...",
    paint: "Drawing first frame...",
  };
  const label = formatI18nCopy(
    copy[stage] ?? defaults[stage] ?? copy.loading ?? "Loading preview...",
    { completed, total },
  );
  return includeAsset && assetName ? `${label}\n${assetName}` : label;
};
