import { createCharacterSpriteCommandApi } from "./commandApi/characterSprites.js";
import { createLayoutCommandApi } from "./commandApi/layouts.js";
import { createResourceCommandApi } from "./commandApi/resources/index.js";
import { createCommandApiShared } from "./commandApi/shared.js";
import { createStoryCommandApi } from "./commandApi/story.js";

export const createCommandApi = (options) => {
  const shared = createCommandApiShared(options);

  return {
    getState: shared.getState,
    getDomainState: shared.getDomainState,
    getEvents: shared.getEvents,
    ...createStoryCommandApi(shared),
    ...createResourceCommandApi(shared),
    ...createCharacterSpriteCommandApi(shared),
    ...createLayoutCommandApi(shared),
  };
};
