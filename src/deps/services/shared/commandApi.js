import { createLayoutCommandApi } from "./commandApi/layouts.js";
import { createResourceCommandApi } from "./commandApi/resources.js";
import { createSettingsCommandApi } from "./commandApi/settings.js";
import { createCommandApiShared } from "./commandApi/shared.js";
import { createStateCommandApi } from "./commandApi/state.js";
import { createStoryCommandApi } from "./commandApi/story.js";

export const createCommandApi = (options) => {
  const shared = createCommandApiShared(options);

  return {
    ...createSettingsCommandApi(shared),
    ...createStoryCommandApi(shared),
    ...createResourceCommandApi(shared),
    ...createLayoutCommandApi(shared),
    ...createStateCommandApi(shared),
  };
};
