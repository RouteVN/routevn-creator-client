import { createStoreUpdater } from "../storeUpdater.js";

export const createAndroidUpdater = ({ distribution, ...options }) => {
  if (distribution !== "google-play") return;
  return createStoreUpdater(options);
};
