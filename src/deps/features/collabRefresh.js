import { filter, tap } from "rxjs";
import { COLLAB_REMOTE_EVENT_ACTION } from "../../collab/remoteEvents.js";
import { COMMAND_TYPES } from "../../domain/commandCatalog.js";

const normalizeTargets = (targets) => {
  if (Array.isArray(targets)) {
    return targets.filter(Boolean);
  }

  if (targets) {
    return [targets];
  }

  return [];
};

export const matchesRemoteTargets = (targets) => {
  const normalizedTargets = normalizeTargets(targets);

  return (payload = {}) => {
    if (payload.eventType === COMMAND_TYPES.PROJECT_CREATED) {
      return true;
    }

    const target = payload.target;
    if (!target) {
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
