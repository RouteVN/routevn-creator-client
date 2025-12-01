export const handleItemClick = (deps, payload) => {
  const { appService, store } = deps;
  const id = payload._event.currentTarget.id.replace("item-", "");
  const resourceItem = store.selectResourceItem(id);
  const currentPayload = appService.getPayload();
  appService.navigate(resourceItem.path, currentPayload);
};
