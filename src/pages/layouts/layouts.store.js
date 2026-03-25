import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";

const layoutForm = {
  title: "Add Layout",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Layout Name",
      required: true,
    },
    {
      name: "layoutType",
      type: "select",
      label: "Layout Type",
      required: true,
      options: [
        { value: "normal", label: "Normal" },
        { value: "dialogue", label: "Dialogue" },
        { value: "nvl", label: "NVL" },
        { value: "choice", label: "Choice" },
      ],
      tooltip: {
        content:
          "Normal is layout that can be used for background or menu pages. Dialogue is used for ADV mode text dialogue layout. NVL is used for novel mode accumulated dialogue layout. Choice is used for the choices.",
      },
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Add Layout",
      },
    ],
  },
};

const layoutTypeLabels = {
  normal: "Normal",
  dialogue: "Dialogue",
  nvl: "NVL",
  choice: "Choice",
};

const buildDetailFields = (item) => {
  if (!item) {
    return [];
  }

  return [
    {
      type: "text",
      label: "Layout Type",
      value: layoutTypeLabels[item.layoutType] ?? item.layoutType ?? "",
    },
  ];
};

const buildCatalogItem = (item) => ({
  id: item.id,
  name: item.name,
  cardKind: "layout",
  subtitle: layoutTypeLabels[item.layoutType] ?? item.layoutType ?? "",
});

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "layout",
  resourceType: "layouts",
  title: "Layouts",
  selectedResourceId: "layouts",
  resourceCategory: "userInterface",
  addText: "Add Layout",
  buildDetailFields,
  buildCatalogItem,
  extendViewData: ({ state, baseViewData }) => ({
    ...baseViewData,
    isAddDialogOpen: state.isAddDialogOpen,
    layoutForm,
    layoutFormDefaults: {
      name: "",
      layoutType: "dialogue",
    },
  }),
});

export const createInitialState = () => ({
  ...createCatalogInitialState(),
  isAddDialogOpen: false,
  targetGroupId: undefined,
});

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectLayoutItemById = selectItemById;

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isAddDialogOpen = true;
  state.targetGroupId = groupId === "_root" ? undefined : groupId;
};

export const closeAddDialog = ({ state }, _payload = {}) => {
  state.isAddDialogOpen = false;
  state.targetGroupId = undefined;
};

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
