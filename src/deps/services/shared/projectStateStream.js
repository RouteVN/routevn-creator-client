import { Observable } from "rxjs";

export const createProjectStateStream = ({
  projectService,
  emitCurrent = true,
} = {}) =>
  new Observable((subscriber) => {
    const cleanupProjectSubscription = projectService.subscribeProjectState(
      (payload) => {
        subscriber.next(payload);
      },
      { emitCurrent },
    );

    return () => {
      if (cleanupProjectSubscription) {
        cleanupProjectSubscription();
      }
    };
  });
