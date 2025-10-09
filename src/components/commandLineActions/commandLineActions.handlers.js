export const handleBeforeMount = (deps) => {
  const actionsType = deps.attrs?.["actions-type"];
  if (!actionsType) {
    throw new Error(
      "actions-type attribute is required for commandLineActions component",
    );
  }
};

export const handleActionClick = (deps, payload) => {
  const { dispatchEvent, store } = deps;
  const id = payload._event.currentTarget.id.replace("action-", "");

  const items = store.selectItems() || [];
  const item = items.find((item) => item.id === id);

  console.log("IIIIIIIIIIIIIIIIIIIIIIIIIII", item);

  if (item) {
    dispatchEvent(
      new CustomEvent("actionClicked", {
        detail: {
          item,
        },
      }),
    );
  }
};
