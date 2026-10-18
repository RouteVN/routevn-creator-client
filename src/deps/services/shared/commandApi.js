import { createCharacterSpriteCommandApi } from "./commandApi/characterSprites.js";
import { createControlCommandApi } from "./commandApi/controls.js";
import { createLayoutCommandApi } from "./commandApi/layouts.js";
import { createResourceCommandApi } from "./commandApi/resources/index.js";
import { createCommandApiShared } from "./commandApi/shared.js";
import { createStoryCommandApi } from "./commandApi/story.js";

// A change that runs this long holds up every change after it; it is reported
// so that a change that never finishes does not go unnoticed.
export const SLOW_CHANGE_REPORT_MS = 60000;

const reportSlowChange = (errorTracker, name) =>
  setTimeout(() => {
    const error = new Error(
      `Project change ${name} is still running after ${SLOW_CHANGE_REPORT_MS / 1000} s`,
    );
    error.name = "SlowProjectChangeError";
    errorTracker?.capture(error, { operation: "projectCommand.slowChange" });
  }, SLOW_CHANGE_REPORT_MS);

// A change is checked against the project state when it starts, then saved,
// then applied to the open project. Two changes running at once would each be
// checked against state without the other: the same save sent twice, as by a
// double click on Save, would store the files it adds twice, and the second
// copy fails on every load. Changes therefore run one at a time, in the order
// they are made. A change that fails does not stop the next one.
//
// A change runs in the project that was open when it was made, with that
// project's repository, even when the route has moved on while it waited:
// routes change before the project they leave is closed. Closing a project
// takes its turn among the changes (`runAfterChanges`): the changes made before
// it reach the project, and one made while it closes runs after it and is
// refused and reported, never applied to a closing or another project.
export const createCommandApi = (options) => {
  const { getCurrentProjectId, getOpenRepository, errorTracker } = options;
  // The project of the change that is running, and its repository. Changes run
  // one at a time, so there is at most one.
  let runningChange;
  const changeShared = createCommandApiShared({
    ...options,
    getCurrentProjectId: () =>
      runningChange?.projectId ?? getCurrentProjectId(),
    getCachedRepository: () =>
      runningChange?.repository ?? options.getCachedRepository(),
    getCurrentRepository: async () =>
      runningChange?.repository ?? options.getCurrentRepository(),
  });
  // Reads are not changes: they read the project that is open now.
  const readShared = createCommandApiShared(options);

  let previousChange = Promise.resolve();

  const runChange = async (name, change, args, target) => {
    if (target.repository && getOpenRepository() !== target.repository) {
      const error = new Error(
        `Project change ${name} was not applied: its project was closed before it ran`,
      );
      error.name = "ProjectClosedError";
      errorTracker?.capture(error, {
        operation: "projectCommand.projectClosed",
      });
      throw error;
    }

    runningChange = target;
    const slowChangeTimer = reportSlowChange(errorTracker, name);
    try {
      return await change(...args);
    } finally {
      clearTimeout(slowChangeTimer);
      runningChange = undefined;
    }
  };

  const orderChanges = (changes) => {
    const orderedChanges = {};
    for (const [name, change] of Object.entries(changes)) {
      orderedChanges[name] = (...args) => {
        // With no project open, the change finds its project when it runs.
        const repository = getOpenRepository?.();
        const target = repository
          ? { projectId: getCurrentProjectId(), repository }
          : {};
        const nextChange = previousChange.then(() =>
          runChange(name, change, args, target),
        );
        previousChange = nextChange.catch(() => {});
        return nextChange;
      };
    }
    return orderedChanges;
  };

  // Resolves once no change is waiting or running, including changes made
  // while it waits. A change that failed counts as finished.
  const waitForChanges = async () => {
    let finishedChange;
    while (finishedChange !== previousChange) {
      finishedChange = previousChange;
      await finishedChange;
    }
  };

  // Runs `task` once the changes made before it have finished, and holds back
  // the changes made after it until it has finished too.
  const runAfterChanges = (task) => {
    const nextTask = previousChange.then(task);
    previousChange = nextTask.catch(() => {});
    return nextTask;
  };

  return {
    getState: readShared.getState,
    getDomainState: readShared.getDomainState,
    waitForChanges,
    runAfterChanges,
    ...orderChanges({
      ...createStoryCommandApi(changeShared),
      ...createResourceCommandApi(changeShared),
      ...createCharacterSpriteCommandApi(changeShared),
      ...createControlCommandApi(changeShared),
      ...createLayoutCommandApi(changeShared),
    }),
  };
};
