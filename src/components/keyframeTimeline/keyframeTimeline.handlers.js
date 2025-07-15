export const handleOnMount = (deps) => {
  // Component mounted
};

export const handleMouseMove = (e, deps) => {
  const { store, render } = deps;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;

  store.setMousePosition(x);
  render();
};

export const handleMouseLeave = (e, deps) => {
  const { store, render } = deps;
  store.hideTimelineLine(e.clientX);
  render();
};
