import { createStoreUpdater } from "../storeUpdater.js";
import { ROUTEVN_CREATOR_APP_STORE_URL } from "../../../internal/routevnUrls.js";

export const createIOSUpdater = (options) =>
  createStoreUpdater({
    ...options,
    fallbackStoreUrl: ROUTEVN_CREATOR_APP_STORE_URL,
  });
