import { createCatalogResourceCommandApi } from "./catalog.js";
import { createMediaResourceCommandApi } from "./media.js";

export const createResourceCommandApi = (shared) => ({
  ...createMediaResourceCommandApi(shared),
  ...createCatalogResourceCommandApi(shared),
});
