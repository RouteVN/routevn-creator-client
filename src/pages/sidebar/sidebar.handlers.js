import { filter, tap } from "rxjs";

export const handleAfterMount = async (deps) => {
  const { repositoryFactory, router, store, fileManagerFactory, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const state = repository.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(p);
  const { url } = await fileManager.getFileContent({
    fileId: project.iconFileId,
  });

  store.setProjectImageUrl(url);

  render();
};

export const handleItemClick = async (deps, payload) => {
  const { subject, router } = deps;
  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: payload._event.detail.item.id,
    payload: currentPayload, // Pass through current payload (including projectId)
  });
};

export const handleHeaderClick = (deps) => {
  const { subject, router } = deps;
  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: "/project",
    payload: currentPayload, // Pass through current payload (including projectId)
  });
};

export const handleProjectImageUpdate = async (deps) => {
  const { repositoryFactory, router, store, render, fileManagerFactory } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const state = repository.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(p);
  const { url } = await fileManager.getFileContent({
    fileId: project.iconFileId,
  });

  store.setProjectImageUrl(url);

  render();
};

export const subscriptions = (deps) => {
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
