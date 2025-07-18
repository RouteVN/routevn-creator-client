export const getQueryParamsObject = () => {
  const queryParams = new URLSearchParams(window.location.search + "");
  const paramsObject = {};

  for (const [key, value] of queryParams.entries()) {
    paramsObject[key] = value;
  }

  return paramsObject;
};

export class LayoutOptions {
  constructor(params) {
    this._isTouchLayout = params?.isTouchLayout || false;
  }

  get isTouchLayout() {
    return this._isTouchLayout;
  }

  setIsTouchLayout = (isTouchLayout) => {
    this._isTouchLayout = isTouchLayout;
  };
}

export const matchPaths = (path, pattern) => {
  // Normalize paths by removing trailing slashes
  const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
  const normalizedPattern = pattern.endsWith("/")
    ? pattern.slice(0, -1)
    : pattern;

  // Convert pattern segments with parameters like [id] to regex patterns
  const regexPattern = normalizedPattern
    .split("/")
    .map((segment) => {
      // Check if segment is a parameter (enclosed in square brackets)
      if (segment.startsWith("[") && segment.endsWith("]")) {
        // Extract parameter name and create a capturing group
        return "([^/]+)";
      }
      // Regular segment, match exactly
      return segment;
    })
    .join("/");

  // Create regex with start and end anchors
  const regex = new RegExp(`^${regexPattern}$`);

  // Test if path matches the pattern
  return regex.test(normalizedPath);
};

export const extractCategoryAndComponent = (filePath) => {
  const parts = filePath.split("/");
  const component = parts[parts.length - 1].split(".")[0];
  const category = parts[parts.length - 3];
  const fileType = parts[parts.length - 1].split(".")[1];
  return { category, component, fileType };
};

// Helper function to flatten arrays while preserving object structure
export const flattenArrays = (items) => {
  if (!Array.isArray(items)) {
    return items;
  }

  return items.reduce((acc, item) => {
    if (Array.isArray(item)) {
      // Recursively flatten nested arrays
      acc.push(...flattenArrays(item));
    } else {
      // If it's an object with nested arrays, process those too
      if (item && typeof item === "object") {
        const entries = Object.entries(item);
        if (entries.length > 0) {
          const [key, value] = entries[0];
          if (Array.isArray(value)) {
            item = { [key]: flattenArrays(value) };
          }
        }
      }
      acc.push(item);
    }
    return acc;
  }, []);
};
