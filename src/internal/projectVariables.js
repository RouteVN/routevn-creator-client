export const getVariableOptions = (variablesData, options = {}) => {
  const { type, showType = false } = options;
  const variablesItems = variablesData?.items || {};

  return Object.entries(variablesItems)
    .filter(([_, item]) => {
      if (item.type === "folder" || item.itemType === "folder") {
        return false;
      }
      if (type && item.type !== type) {
        return false;
      }
      return true;
    })
    .map(([id, variable]) => {
      const varType = (variable.type || "string").toLowerCase();
      return {
        label: showType ? `${variable.name} (${varType})` : variable.name,
        value: id,
      };
    });
};
