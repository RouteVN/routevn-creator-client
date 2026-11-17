export const createInitialState = () => ({
  isMenuOpen: false,
  menuPosition: { x: 0, y: 0 },
  // The import dialog, and what it imports from: the asset store, a package
  // ZIP `file` picked from this device, or a URL typed in the dialog.
  importDialog: { isOpen: false, source: "store", file: undefined },
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

export const selectMenuPosition = ({ state }) => ({
  x: state.menuPosition.x,
  y: state.menuPosition.y,
});

export const openImportDialog = ({ state }, { source, file } = {}) => {
  state.importDialog.isOpen = true;
  state.importDialog.source = source ?? "store";
  state.importDialog.file = file;
};

// The dialog keeps its source while it closes; the picked file is let go.
export const closeImportDialog = ({ state }) => {
  state.importDialog.isOpen = false;
  state.importDialog.file = undefined;
};

export const selectViewData = ({ state, props = {}, i18n = {} }) => {
  const copy = i18n.resourceImport ?? {};
  const importLabel = copy.importButton ?? "Import";
  const showImport = props.showImport ?? true;
  const menuItems = [...(props.additionalMenuItems ?? [])];
  if (showImport) {
    menuItems.push(
      {
        label: copy.importFromStoreMenuItem ?? "Import from Asset Store",
        type: "item",
        value: "import-store",
      },
      {
        label: copy.importFromZipMenuItem ?? "Import from Zip File",
        type: "item",
        value: "import-zip",
      },
      {
        label: copy.importFromUrlMenuItem ?? "Import from URL",
        type: "item",
        value: "import-url",
      },
    );
  }

  return {
    importLabel,
    menuLabel:
      showImport && !props.additionalMenuItems?.length
        ? importLabel
        : (i18n.resourcePages?.actionsLabel ?? "Actions"),
    isImportDialogOpen: state.importDialog.isOpen,
    importSource: state.importDialog.source,
    importFile: state.importDialog.file,
    menu: {
      isOpen: state.isMenuOpen,
      x: state.menuPosition.x,
      y: state.menuPosition.y,
      items: menuItems,
    },
  };
};
