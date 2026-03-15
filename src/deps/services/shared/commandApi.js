import { createLayoutCommandApi } from "./commandApi/layouts.js";
import { createResourceCommandApi } from "./commandApi/resources.js";
import { createCommandApiShared } from "./commandApi/shared.js";
import { createStateCommandApi } from "./commandApi/state.js";
import { createStoryCommandApi } from "./commandApi/story.js";

export const createCommandApi = (options) => {
  const shared = createCommandApiShared(options);

  return {
    ...createStoryCommandApi(shared),
    ...createResourceCommandApi(shared),
    ...createLayoutCommandApi(shared),
    ...createStateCommandApi(shared),
  };
};
