import { createLayoutCommandApi } from "./typedCommandApi/layouts.js";
import { createResourceCommandApi } from "./typedCommandApi/resources.js";
import { createSettingsCommandApi } from "./typedCommandApi/settings.js";
import { createTypedCommandShared } from "./typedCommandApi/shared.js";
import { createStateCommandApi } from "./typedCommandApi/state.js";
import { createStoryCommandApi } from "./typedCommandApi/story.js";

export const createTypedCommandApi = (options) => {
  const shared = createTypedCommandShared(options);

  return {
    ...createSettingsCommandApi(shared),
    ...createStoryCommandApi(shared),
    ...createResourceCommandApi(shared),
    ...createLayoutCommandApi(shared),
    ...createStateCommandApi(shared),
  };
};
