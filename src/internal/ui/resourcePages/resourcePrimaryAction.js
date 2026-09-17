export const handleResourceItemLongPress = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.getAttribute("data-item-id");
  if (!itemId) return;

  dispatchEvent(
    new CustomEvent("item-dblclick", {
      detail: { itemId, source: "long-press" },
      bubbles: true,
      composed: true,
    }),
  );
};
