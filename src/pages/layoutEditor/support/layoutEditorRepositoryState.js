export const getLayoutEditorResourceCollection = (
  repositoryState,
  resourceType,
) => {
  return resourceType === "controls"
    ? repositoryState.controls || { items: {}, tree: [] }
    : repositoryState.layouts || { items: {}, tree: [] };
};

export const createLayoutEditorRepositoryStoreData = ({
  repositoryState,
  layoutId,
  resourceType = "layouts",
} = {}) => {
  const { images, layouts, textStyles, colors, fonts, variables } =
    repositoryState ?? {};
  const resourceCollection = getLayoutEditorResourceCollection(
    repositoryState,
    resourceType,
  );
  const layout = layoutId ? resourceCollection.items?.[layoutId] : undefined;

  return {
    projectResolution: repositoryState?.project?.resolution,
    layoutId,
    layout,
    resourceType,
    layoutData: layout?.elements || { items: {}, tree: [] },
    images: images || { items: {}, tree: [] },
    layoutsData: layouts || { items: {}, tree: [] },
    textStylesData: textStyles || { items: {}, tree: [] },
    colorsData: colors || { items: {}, tree: [] },
    fontsData: fonts || { items: {}, tree: [] },
    variablesData: variables || { items: {}, tree: [] },
  };
};
