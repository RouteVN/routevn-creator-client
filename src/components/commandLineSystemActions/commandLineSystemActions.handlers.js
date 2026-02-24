export const handleActionClick = (deps, payload) => {
  const { dispatchEvent, store } = deps;
  const target = payload._event.currentTarget;
  const id =
    target?.dataset?.actionId || target?.id?.replace("action", "") || "";

  const items = store.selectItems() || [];
  const item = items.find((item) => item.id === id);

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
