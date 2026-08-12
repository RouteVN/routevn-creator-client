export const createInitialState = () => ({
  isMenuOpen: false,
  menuPosition: { x: 0, y: 0 },
  isImportDialogOpen: false,
});

export const openMenu = ({ state }, { x, y } = {}) => {
  state.isMenuOpen = true;
  state.menuPosition.x = x ?? 0;
  state.menuPosition.y = y ?? 0;
};

export const closeMenu = ({ state }) => {
  state.isMenuOpen = false;
  state.menuPosition.x = 0;
  state.menuPosition.y = 0;
};

export const openImportDialog = ({ state }) => {
  state.isImportDialogOpen = true;
};

export const closeImportDialog = ({ state }) => {
  state.isImportDialogOpen = false;
};

export const selectViewData = ({ state, i18n = {} }) => {
  const copy = i18n.resourceImport ?? {};
  const importLabel = copy.importButton ?? "Import";
  return {
    importLabel,
    isImportDialogOpen: state.isImportDialogOpen,
    menu: {
      isOpen: state.isMenuOpen,
      x: state.menuPosition.x,
      y: state.menuPosition.y,
      items: [{ label: importLabel, type: "item", value: "import" }],
    },
  };
};
