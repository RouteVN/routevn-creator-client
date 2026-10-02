// Keep the point at the center of the scrolling canvas workspace in place
// while its content resizes, so zoom buttons zoom around what is in view.
export const keepViewportCenter = (viewport, resize) => {
  const centerX =
    (viewport.scrollLeft + viewport.clientWidth / 2) / viewport.scrollWidth;
  const centerY =
    (viewport.scrollTop + viewport.clientHeight / 2) / viewport.scrollHeight;
  resize();
  viewport.scrollLeft =
    centerX * viewport.scrollWidth - viewport.clientWidth / 2;
  viewport.scrollTop =
    centerY * viewport.scrollHeight - viewport.clientHeight / 2;
};
