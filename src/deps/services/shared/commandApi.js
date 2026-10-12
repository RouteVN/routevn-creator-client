import { createCharacterSpriteCommandApi } from "./commandApi/characterSprites.js";
import { createControlCommandApi } from "./commandApi/controls.js";
import { createLayoutCommandApi } from "./commandApi/layouts.js";
import { createResourceCommandApi } from "./commandApi/resources/index.js";
import { createCommandApiShared } from "./commandApi/shared.js";
import { createStoryCommandApi } from "./commandApi/story.js";

// A change is checked against the project state when it starts, then saved,
// then applied to the open project. Two changes running at once would each be
// checked against state without the other: the same save sent twice, as by a
// double click on Save, would store the files it adds twice, and the second
// copy fails on every load. Changes therefore run one at a time, in the order
// they are made. A change that fails does not stop the next one.
const runChangesInOrder = (changes) => {
  let previousChange = Promise.resolve();
  const orderedChanges = {};

  for (const [name, change] of Object.entries(changes)) {
    orderedChanges[name] = (...args) => {
      const nextChange = previousChange.then(() => change(...args));
      previousChange = nextChange.catch(() => {});
      return nextChange;
    };
  }

  return orderedChanges;
};

export const createCommandApi = (options) => {
  const shared = createCommandApiShared(options);

  return {
    getState: shared.getState,
    getDomainState: shared.getDomainState,
    ...runChangesInOrder({
      ...createStoryCommandApi(shared),
      ...createResourceCommandApi(shared),
      ...createCharacterSpriteCommandApi(shared),
      ...createControlCommandApi(shared),
      ...createLayoutCommandApi(shared),
    }),
  };
};
