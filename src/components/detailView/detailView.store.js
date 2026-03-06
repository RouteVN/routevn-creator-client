const SECTION_TYPES = new Set(["section", "group"]);

export const createInitialState = () => ({});

const normalizeFields = (fields = []) => {
  if (!Array.isArray(fields)) {
    return [];
  }

  const normalized = [];
  for (const field of fields) {
    if (!field || typeof field !== "object") {
      continue;
    }

    const type = field.type ?? "text";
    if (SECTION_TYPES.has(type)) {
      const sectionLabel = field.label ?? "";
      if (sectionLabel) {
        normalized.push({
          type: "section",
          label: sectionLabel,
        });
      }

      normalized.push(...normalizeFields(field.fields ?? []));
      continue;
    }

    if (type === "slot") {
      normalized.push({
        type: "slot",
        label: field.label ?? "",
        slot: field.slot ?? "",
      });
      continue;
    }

    if (type === "description") {
      normalized.push({
        type: "description",
        value: field.value ?? "",
      });
      continue;
    }

    if (type === "text") {
      normalized.push({
        type: "text",
        label: field.label ?? "",
        value: field.value ?? "",
      });
      continue;
    }

    if (type === "text-inline") {
      normalized.push({
        type: "text-inline",
        label: field.label ?? "",
        value: field.value ?? "",
      });
    }
  }

  return normalized;
};

export const selectViewData = ({ props }) => {
  return {
    flatFields: normalizeFields(props.fields ?? []),
  };
};
