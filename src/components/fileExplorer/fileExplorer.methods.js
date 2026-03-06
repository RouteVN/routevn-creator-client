export function selectItem(payload = {}) {
  const { itemId } = payload;

  if (!itemId) {
    return;
  }

  this.transformedHandlers.handlePageItemClick({
    _event: {
      detail: {
        itemId,
      },
    },
  });
}
