export const handleTypographyItemClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  const id = e.currentTarget.id.replace("typography-item-", "");

  store.setSelectedTypographyId({
    typographyId: id,
  });

  dispatchEvent(
    new CustomEvent("typography-selected", {
      detail: {
        typographyId: id,
      },
    }),
  );

  render();
};

export const handleClearClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  store.setSelectedTypographyId({
    typographyId: undefined,
  });

  dispatchEvent(
    new CustomEvent("typography-selected", {
      detail: {
        typographyId: null,
      },
    }),
  );

  render();
};

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;

  store.setSearchQuery({
    query: e.detail.value,
  });

  render();
};
