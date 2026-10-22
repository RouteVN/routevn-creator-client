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

export const handleMenuItemClick = (deps, payload) => {
  const { dispatchEvent, render, store } = deps;
  const { item } = payload._event.detail;
  const position = store.selectMenuPosition();
  store.closeMenu();
  if (item.value === "import") {
    store.openImportDialog();
  } else {
    dispatchEvent(
      new CustomEvent("menu-action", {
        detail: { item, position },
        bubbles: true,
        composed: true,
      }),
    );
  }
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
