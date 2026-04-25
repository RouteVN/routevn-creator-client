const PATCH_MARKER = "__routevnAssetParserCompatibilityPatched";

export const normalizeRouteGraphicsAssetLoadInput = (input) => {
  if (Array.isArray(input)) {
    return input.map((item) => normalizeRouteGraphicsAssetLoadInput(item));
  }

  if (!input || typeof input !== "object") {
    return input;
  }

  const normalized = { ...input };

  if (typeof normalized.parser === "string" && !normalized.loadParser) {
    normalized.loadParser = normalized.parser;
  }

  if (Array.isArray(normalized.src)) {
    normalized.src = normalized.src.map((item) =>
      normalizeRouteGraphicsAssetLoadInput(item),
    );
  }

  return normalized;
};

export const patchRouteGraphicsAssetParserCompatibility = (Assets) => {
  if (!Assets || typeof Assets.load !== "function" || Assets[PATCH_MARKER]) {
    return;
  }

  const originalLoad = Assets.load.bind(Assets);

  Assets.load = (input, onProgress) => {
    return originalLoad(
      normalizeRouteGraphicsAssetLoadInput(input),
      onProgress,
    );
  };

  Object.defineProperty(Assets, PATCH_MARKER, {
    value: true,
  });
};
