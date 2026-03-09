import { Observable } from "rxjs";

export const createProjectStateStream = ({
  projectService,
  emitCurrent = true,
} = {}) => {
  return new Observable((subscriber) => {
    let cleanupProjectSubscription;
    let isActive = true;

    projectService
      .subscribeProjectState(
        (payload) => {
          if (!subscriber.closed) {
            subscriber.next(payload);
          }
        },
        { emitCurrent },
      )
      .then((cleanup) => {
        cleanupProjectSubscription = cleanup;

        if (!isActive) {
          cleanupProjectSubscription?.();
          cleanupProjectSubscription = undefined;
        }
      })
      .catch((error) => {
        if (!subscriber.closed) {
          subscriber.error(error);
        }
      });

    return () => {
      isActive = false;
      cleanupProjectSubscription?.();
      cleanupProjectSubscription = undefined;
    };
  });
};
