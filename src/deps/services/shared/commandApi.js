import { createCharacterSpriteCommandApi } from "./commandApi/characterSprites.js";
import { createControlCommandApi } from "./commandApi/controls.js";
import { createLayoutCommandApi } from "./commandApi/layouts.js";
import { createResourceCommandApi } from "./commandApi/resources/index.js";
import { createCommandApiShared } from "./commandApi/shared.js";
import { createStoryCommandApi } from "./commandApi/story.js";

export const createCommandApi = (options) => {
  const shared = createCommandApiShared(options);

  return {
    getState: shared.getState,
    getDomainState: shared.getDomainState,
    ...createStoryCommandApi(shared),
    ...createResourceCommandApi(shared),
    ...createCharacterSpriteCommandApi(shared),
    ...createControlCommandApi(shared),
    ...createLayoutCommandApi(shared),
  };
};
