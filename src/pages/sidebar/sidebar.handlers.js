import { filter, tap } from "rxjs";

export const handleAfterMount = async (deps) => {
  const { repository, store, httpClient, render } = deps;
  const state = repository.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  const { url } = await httpClient.creator.getFileContent({
    fileId: project.iconFileId,
    projectId: "someprojectId",
  });

  store.setProjectImageUrl(url);

  render();
};

export const handleItemClick = async (payload, deps) => {
  const { render, router, subject } = deps;
  subject.dispatch("redirect", {
    path: payload.detail.item.id,
  });
};

export const handleHeaderClick = (payload, deps) => {
  const { render, router, subject } = deps;
  subject.dispatch("redirect", {
    path: "/project",
  });
};

export const handleProjectImageUpdate = async (_, deps) => {
  const { repository, store, render, httpClient } = deps;
  const state = repository.getState();
  const project = state.project;

  if (!project.iconFileId) {
    return;
  }

  const { url } = await httpClient.creator.getFileContent({
    fileId: project.iconFileId,
    projectId: "someprojectId",
  });

  store.setProjectImageUrl(url);

  render();
};

export const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action, payload }) => action === "project-image-update"),
      tap(({ action, payload }) => {
        deps.handlers.handleProjectImageUpdate(payload, deps);
      }),
    ),
  ];
};
