const sortObjectKeys = (_key, value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    sorted[key] = value[key];
  }
  return sorted;
};

// JSON with every object's keys sorted, so equal values give the same text
// whatever order their keys were set in. Otherwise as JSON.stringify: an
// undefined object value is left out.
export const stableStringify = (value) => JSON.stringify(value, sortObjectKeys);
