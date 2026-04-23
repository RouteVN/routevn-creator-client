export function openEditDialog(payload = {}) {
  const { itemId } = payload;
  if (!itemId) {
    return;
  }

  this.transformedHandlers.handleOpenEditDialog({ itemId });
}

export function appendTagIdToForm(payload = {}) {
  const { tagId } = payload;
  if (!tagId) {
    return;
  }

  this.transformedHandlers.handleAppendTagIdToForm({ tagId });
}
