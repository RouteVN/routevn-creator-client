export function restartPreview() {
  this.transformedHandlers.restartPreview({});
}

export function captureThumbnailImage() {
  return this.transformedHandlers.handleCaptureThumbnailImage({});
}

export function useDefaultSelectionOccurrence() {
  return this.transformedHandlers.handleUseDefaultSelectionOccurrence({});
}
