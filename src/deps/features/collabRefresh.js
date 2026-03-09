import { filter, tap } from "rxjs";
import { COLLAB_REMOTE_EVENT_ACTION } from "../../collab/remoteEvents.js";

const normalizeTargets = (targets) => {
  if (Array.isArray(targets)) {
    return targets.filter((target) => typeof target === "string" && target);
  }

  if (typeof targets === "string" && targets) {
    return [targets];
  }

  return [];
};

export const matchesRemoteTargets = (targets) => {
  const normalizedTargets = normalizeTargets(targets);

  return (payload = {}) => {
    if (payload.eventType === "project.created") {
      return true;
    }

    const target = payload.target;
    if (typeof target !== "string" || target.length === 0) {
      return false;
    }

    return normalizedTargets.some((expectedTarget) => {
      return (
        target === expectedTarget || target.startsWith(`${expectedTarget}.`)
      );
    });
  };
};

export const createCollabRemoteRefreshStream = ({
  deps,
  refresh,
  matches = () => true,
}) => {
  const { subject } = deps;

  return subject.pipe(
    filter(({ action, payload }) => {
      return action === COLLAB_REMOTE_EVENT_ACTION && matches(payload);
    }),
    tap(({ payload }) => {
      void refresh(deps, payload);
    }),
  );
};

export const mountCollabRemoteRefresh = (options) => {
  const stream = createCollabRemoteRefreshStream(options);
  const subscription = stream.subscribe();
  return () => {
    subscription.unsubscribe();
  };
};
