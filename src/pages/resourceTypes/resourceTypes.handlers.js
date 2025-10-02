export const handleItemClick = (deps, payload) => {
  const { subject, store, router } = deps;
  const id = payload._event.currentTarget.id.replace("item-", "");
  const resourceItem = store.selectResourceItem(id);
  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: resourceItem.path,
    payload: currentPayload,
  });
};
