import {
  createNavigationTiming,
  logNavigationInteractionTiming,
} from "../../internal/navigationTiming.js";

export const handleItemClick = (deps, payload) => {
  const { appService, store } = deps;
  const id =
    payload._event.currentTarget.getAttribute?.("data-item-id") ||
    payload._event.currentTarget.id.replace("item", "");
  if (!id) {
    return;
  }

  const resourceItem = store.selectResourceItem(id);
  if (!resourceItem?.path) {
    return;
  }

  const currentPayload = appService.getPayload();
  const timing = createNavigationTiming({
    appService,
    source: "images-mobile-resource-types.item.click",
    path: resourceItem.path,
    payload: currentPayload,
    event: payload._event,
    data: { itemId: id },
  });
  appService.navigate(resourceItem.path, currentPayload, {
    historyMode: "replace",
    timing,
  });
};

export const handleItemPointerDown = (deps, payload) => {
  const { appService } = deps;
  logNavigationInteractionTiming({
    appService,
    source: "images-mobile-resource-types.item.pointerdown",
    event: payload._event,
    data: {
      itemId: payload._event.currentTarget.getAttribute?.("data-item-id"),
    },
  });
};

export const handleItemPointerUp = (deps, payload) => {
  const { appService } = deps;
  logNavigationInteractionTiming({
    appService,
    source: "images-mobile-resource-types.item.pointerup",
    event: payload._event,
    data: {
      itemId: payload._event.currentTarget.getAttribute?.("data-item-id"),
    },
  });
};
