export function restartPreview() {
  this.transformedHandlers.restartPreview({});
}

export function useDefaultSelectionOccurrence() {
  return this.transformedHandlers.handleUseDefaultSelectionOccurrence({});
}

export function discardPendingUpdate() {
  this.transformedHandlers.handleDiscardPendingUpdate({});
}
