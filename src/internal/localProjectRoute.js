export const LOCAL_PROJECT_PATH_PAYLOAD_KEY = "lp";

export const getLocalProjectPathFromPayload = (payload = {}) => {
  return payload?.[LOCAL_PROJECT_PATH_PAYLOAD_KEY] ?? "";
};

export const createProjectRoutePayload = ({
  projectId,
  projectPath,
  payload = {},
} = {}) => {
  const nextPayload = {
    ...payload,
    p: projectId,
  };

  if (projectPath) {
    nextPayload[LOCAL_PROJECT_PATH_PAYLOAD_KEY] = projectPath;
  } else {
    delete nextPayload[LOCAL_PROJECT_PATH_PAYLOAD_KEY];
  }

  return nextPayload;
};
