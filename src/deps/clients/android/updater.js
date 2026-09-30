import { createStoreUpdater } from "../storeUpdater.js";

// Google Play and direct builds both ask RouteVN's update service. The update
// dialog opens the URL it returns: the Play listing, or for a direct build the
// download page in the browser.
export const createAndroidUpdater = ({ distribution, ...options }) => {
  if (!["google-play", "direct"].includes(distribution)) return;
  return createStoreUpdater(options);
};
