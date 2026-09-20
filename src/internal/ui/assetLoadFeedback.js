import { formatI18nCopy } from "./i18nCopy.js";

// route-graphics exposes file keys on details.assetKey and groups failures in
// AggregateError.errors. File reads and font validation use fileId directly.
export const getAssetLoadFailures = (error) => {
  if (error instanceof AggregateError) {
    return error.errors.flatMap(getAssetLoadFailures);
  }
  return [{ fileId: error?.fileId ?? error?.details?.assetKey, error }];
};

export const getAssetNames = (repository, resources, types) => {
  const names = new Map();
  const add = (item, type, name = item.name ?? item.fontFamily) => {
    if (!item.fileId) return;
    names.set(item.fileId, `${type}: ${name ?? item.fileId}`);
  };
  for (const [collection, fallback] of Object.entries({
    images: "Images",
    spritesheets: "Spritesheets",
    videos: "Videos",
    sounds: "Sounds",
    fonts: "Fonts",
  })) {
    const type = types[collection] ?? fallback;
    for (const item of Object.values(resources[collection] ?? {})) {
      add(item, type);
    }
    // Runtime projections omit authoring names; prefer repository records.
    for (const item of Object.values(repository[collection]?.items ?? {})) {
      add(item, type);
    }
  }
  for (const voices of Object.values(resources.voices ?? {})) {
    for (const item of Object.values(voices)) {
      add(item, types.voices ?? "Voices");
    }
  }
  for (const item of Object.values(repository.voices?.items ?? {})) {
    add(item, types.voices ?? "Voices");
  }
  for (const character of Object.values(repository.characters?.items ?? {})) {
    for (const sprite of Object.values(character.sprites?.items ?? {})) {
      add(
        sprite,
        types.characters ?? "Characters",
        `${character.name ?? character.id} / ${sprite.name ?? sprite.id ?? sprite.fileId}`,
      );
    }
  }
  return names;
};

export const showAssetLoadFailures = (
  deps,
  failures,
  resources = {},
  { previewBlocked = false } = {},
) => {
  if (failures.length === 0) return;
  const { appService, projectService, i18n = {} } = deps;
  const copy = i18n.assetLoadFeedback ?? {};
  const repository = projectService?.getRepositoryState?.() ?? {};
  const types = { ...i18n.resourceTypes, voices: copy.voices ?? "Voices" };
  const names = getAssetNames(repository, resources, types);
  const uniqueFailures = new Map(
    failures.map((failure) => [failure.fileId ?? failure.error, failure]),
  );
  const assetNames = [];
  for (const { fileId } of uniqueFailures.values()) {
    if (fileId) {
      assetNames.push(
        names.get(fileId) ??
          formatI18nCopy(copy.file ?? "Asset file: {fileId}", { fileId }),
      );
    } else {
      assetNames.push(copy.unknown ?? "An unidentified asset");
    }
  }
  let message = formatI18nCopy(
    copy.failed ??
      "Could not load these assets:\n{assets}\n\nCheck their files and replace them with valid copies if needed.",
    { assets: assetNames.map((name) => `• ${name}`).join("\n") },
  );
  if (previewBlocked) {
    message = `${copy.previewBlocked ?? "Preview cannot be played because these assets could not be loaded."}\n\n${message}`;
  }
  appService.showAlert({
    title: i18n.resourcePages?.warningTitle ?? "Warning",
    message,
  });
};
