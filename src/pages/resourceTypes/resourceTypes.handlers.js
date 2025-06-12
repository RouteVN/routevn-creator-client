export const handleItemClick = (e, deps) => {
  const { subject, store } = deps;
  const id = e.target.id.replace('item-', '');
  const resourceItem = store.selectResourceItem(id);
  subject.dispatch('redirect', {
    path: resourceItem.path,
  })
}
