import { filter, tap } from "rxjs";
import { createNavigationTiming } from "../../internal/navigationTiming.js";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => {
  return mountSubscriptions(deps);
};

const syncSidebarProjectIcon = (deps, currentProjectEntry) => {
  const { appService, store, render } = deps;
  const projectEntry =
    currentProjectEntry ?? appService.getCurrentProjectEntry();
  if (projectEntry?.iconUrl) {
    store.setProjectImageUrl({ imageUrl: projectEntry.iconUrl });
    render();
  }
};

export const handleAfterMount = async (deps) => {
  const { appService } = deps;
  const currentProjectEntry = await appService.refreshCurrentProjectEntry();
  syncSidebarProjectIcon(deps, currentProjectEntry);
};

export const handleItemClick = async (deps, payload) => {
  const { subject, appService } = deps;
  const currentPayload = appService.getPayload();
  const item = payload._event.detail.item;
  const path = item.path ?? item.id;
  const timing = createNavigationTiming({
    appService,
    source: "sidebar.item-click",
    path,
    payload: currentPayload,
    event: payload._event,
  });
  subject.dispatch("redirect", {
    path,
    payload: currentPayload, // Pass through current payload (including projectId)
    historyMode: "replace",
    timing,
  });
};

export const handleHeaderClick = (deps) => {
  const { subject, appService } = deps;
  const currentPayload = appService.getPayload();
  const timing = createNavigationTiming({
    appService,
    source: "sidebar.header-click",
    path: "/project",
    payload: currentPayload,
  });
  subject.dispatch("redirect", {
    path: "/project",
    payload: currentPayload, // Pass through current payload (including projectId)
    historyMode: "replace",
    timing,
  });
};

export const handleProjectImageUpdate = async (deps) => {
  const { appService } = deps;
  const currentProjectEntry = await appService.refreshCurrentProjectEntry();
  syncSidebarProjectIcon(deps, currentProjectEntry);
};

const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === "project-image-update"),
      tap(({ payload }) => {
        deps.handlers.handleProjectImageUpdate(deps, payload);
      }),
    ),
  ];
};
