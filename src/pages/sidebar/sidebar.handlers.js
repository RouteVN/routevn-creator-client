
export const handleItemClick = async (payload, deps) => {
  const { render, router, subject } = deps;
  console.log('handleItemClick', payload.detail);
  // deps.render();
  subject.dispatch('redirect', {
    path: payload.detail.item.id,
  })
}

