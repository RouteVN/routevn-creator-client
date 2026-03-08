export function selectItem(payload = {}) {
  const { itemId } = payload;

  this.transformedHandlers.handlePageItemClick({
    _event: {
      detail: {
        itemId,
      },
    },
  });
}
