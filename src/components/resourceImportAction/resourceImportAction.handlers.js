import { formatPluralCopy } from "../../internal/ui/i18nCopy.js";

const resolveMenuPosition = (element) => {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.right),
    y: Math.round(rect.bottom),
  };
};

export const handleMenuButtonClick = (deps, payload) => {
  const { render, store } = deps;
  const { _event } = payload;
  _event.stopPropagation();
  store.openMenu(resolveMenuPosition(_event.currentTarget));
  render();
};

export const handleMenuClose = (deps) => {
  const { render, store } = deps;
  store.closeMenu();
  render();
};

// What each Import menu item opens the import dialog on.
const IMPORT_SOURCE_BY_ITEM_VALUE = Object.freeze({
  "import-store": "store",
  "import-zip": "zip",
  "import-url": "url",
});

// A package ZIP file. Both forms are named, as a platform's picker may know
// a file by its extension or by its type.
const ZIP_FILE_ACCEPT = ".zip,application/zip";

// The asset store and the URL form open in the import dialog at once. A ZIP
// file is picked first, and the dialog opens on it once one is chosen.
export const handleMenuItemClick = async (deps, payload) => {
  const { appService, dispatchEvent, i18n, render, store } = deps;
  const { item } = payload._event.detail;
  const position = store.selectMenuPosition();
  store.closeMenu();
  const source = IMPORT_SOURCE_BY_ITEM_VALUE[item.value];
  if (source === undefined) {
    dispatchEvent(
      new CustomEvent("menu-action", {
        detail: { item, position },
        bubbles: true,
        composed: true,
      }),
    );
    render();
    return;
  }
  if (source !== "zip") {
    store.openImportDialog({ source });
    render();
    return;
  }

  render();
  let file;
  try {
    file = await appService.pickFiles({
      accept: ZIP_FILE_ACCEPT,
      multiple: false,
    });
  } catch {
    appService.showToast({
      message:
        i18n.resourceImport?.zipPickFailed ?? "The file could not be selected.",
      status: "error",
    });
    return;
  }
  if (!file) return;
  store.openImportDialog({ source, file });
  render();
};

export const handleImportDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeImportDialog();
  render();
};

export const handleResourceImportComplete = (deps, payload) => {
  const { appService, dispatchEvent, i18n, render, store } = deps;
  const result = payload._event.detail;
  store.closeImportDialog();
  appService.showToast({
    message: formatPluralCopy(
      {
        assetPackageImported_one:
          "Imported {count} resource from the asset package.",
        assetPackageImported_other:
          "Imported {count} resources from the asset package.",
        ...i18n.resourceImport,
      },
      "assetPackageImported",
      result.importedCount,
      { dateTime: i18n.dateTime },
    ),
    status: "success",
  });
  render();
  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value: "" },
      bubbles: true,
      composed: true,
    }),
  );
  dispatchEvent(
    new CustomEvent("tag-filter-change", {
      detail: { tagIds: [] },
      bubbles: true,
      composed: true,
    }),
  );
  dispatchEvent(
    new CustomEvent("import-complete", {
      detail: result,
      bubbles: true,
      composed: true,
    }),
  );
};
