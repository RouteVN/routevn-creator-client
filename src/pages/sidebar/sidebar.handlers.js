import { filter, tap } from "rxjs";

const mountLegacySubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => {
  return mountLegacySubscriptions(deps);
};

export const handleAfterMount = async (deps) => {
  const { projectService, store, render } = deps;
  await projectService.ensureRepository();
  const state = projectService.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  const { url } = await projectService.getFileContent(project.iconFileId);
  store.setProjectImageUrl({ imageUrl: url });
  render();
};

export const handleItemClick = async (deps, payload) => {
  const { subject, appService } = deps;
  const currentPayload = appService.getPayload();
  subject.dispatch("redirect", {
    path: payload._event.detail.item.id,
    payload: currentPayload, // Pass through current payload (including projectId)
  });
};

export const handleHeaderClick = (deps) => {
  const { subject, appService } = deps;
  const currentPayload = appService.getPayload();
  subject.dispatch("redirect", {
    path: "/project",
    payload: currentPayload, // Pass through current payload (including projectId)
  });
};

export const handleProjectImageUpdate = async (deps) => {
  const { projectService, store, render } = deps;
  const state = projectService.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  const { url } = await projectService.getFileContent(project.iconFileId);
  store.setProjectImageUrl({ imageUrl: url });
  render();
};

const subscriptions = (deps) => {
  const { subject, render } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === "project-image-update"),
      tap(({ payload }) => {
        deps.handlers.handleProjectImageUpdate(deps, payload);
      }),
    ),
    subject.pipe(
      filter(({ action }) => action === "redirect"),
      tap(() => {
        // Small delay to ensure route has changed
        render();
      }),
    ),
  ];
};
