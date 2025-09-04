export const handleItemClick = (e, deps) => {
  const { subject, store, router } = deps;
  const id = e.currentTarget.id.replace("item-", "");
  const resourceItem = store.selectResourceItem(id);
  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: resourceItem.path,
    payload: currentPayload,
  });
};
