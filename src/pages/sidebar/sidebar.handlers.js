import { filter, tap } from "rxjs";

export const handleBeforeMount = (deps) => {
  const { repository, store } = deps;
  const state = repository.getState();
  const project = state.project;

  if (project.imageUrl) {
    store.setProjectImageUrl(project.imageUrl);
  }
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

export const handleProjectImageUpdate = (_, deps) => {
  const { repository, store, render } = deps;
  const state = repository.getState();
  const project = state.project;

  if (project.imageUrl) {
    store.setProjectImageUrl(project.imageUrl);
  }

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
