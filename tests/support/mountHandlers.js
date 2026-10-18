// Runs a page's mount hooks the way Rettangoli does: handleBeforeMount, then
// handleAfterMount without waiting for it. `afterMount` settles with the
// after-mount work, and `unmount` runs the before-mount cleanup, as closing
// the page does.
export const mountHandlers = (handlers, deps) => {
  const cleanup = handlers.handleBeforeMount?.(deps);
  const afterMount = Promise.resolve(handlers.handleAfterMount?.(deps));

  return {
    afterMount,
    unmount: () => cleanup?.(),
  };
};
