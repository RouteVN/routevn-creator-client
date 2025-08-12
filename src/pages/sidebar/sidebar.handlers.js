import { filter, tap } from "rxjs";

export const handleAfterMount = async (deps) => {
  const { repository, store, getFileContent, render } = deps;
  const state = repository.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  const { url } = await getFileContent({
    fileId: project.iconFileId,
    projectId: "someprojectId",
  });

  store.setProjectImageUrl(url);

  render();
};

export const handleItemClick = async (payload, deps) => {
  const { subject } = deps;
  subject.dispatch("redirect", {
    path: payload.detail.item.id,
  });
};

export const handleHeaderClick = (payload, deps) => {
  const { subject } = deps;
  subject.dispatch("redirect", {
    path: "/project",
  });
};

export const handleProjectImageUpdate = async (_, deps) => {
  const { repository, store, render, getFileContent } = deps;
  const state = repository.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  const { url } = await getFileContent({
    fileId: project.iconFileId,
    projectId: "someprojectId",
  });

  store.setProjectImageUrl(url);

  render();
};

export const subscriptions = (deps) => {
  const { subject, render } = deps;
  return [
    subject.pipe(
      filter(({ action, payload }) => action === "project-image-update"),
      tap(({ action, payload }) => {
        deps.handlers.handleProjectImageUpdate(payload, deps);
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
