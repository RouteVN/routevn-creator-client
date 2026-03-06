export function openEditDialog(payload = {}) {
  const { itemId } = payload;
  if (!itemId) {
    return;
  }

  this.transformedHandlers.handleOpenEditDialog({ itemId });
}
