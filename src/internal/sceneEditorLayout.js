export const isMobileSceneEditorSideBySide = ({ isTouchMode, width, height }) =>
  isTouchMode && width >= 768 && width > height;
