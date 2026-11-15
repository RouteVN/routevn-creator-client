export function startNew(payload = {}) {
  return this.transformedHandlers.handleStartNew(payload);
}

export function loadSpritesheet(payload = {}) {
  return this.transformedHandlers.handleLoadSpritesheet(payload);
}

export function getDraft() {
  return this.transformedHandlers.handleGetDraft({});
}

export function markSaved(payload = {}) {
  return this.transformedHandlers.handleMarkSaved(payload);
}

export function undo() {
  return this.transformedHandlers.handleUndo({});
}

export function redo() {
  return this.transformedHandlers.handleRedo({});
}
