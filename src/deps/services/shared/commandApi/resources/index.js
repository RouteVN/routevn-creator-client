import { createCatalogResourceCommandApi } from "./catalog.js";
import { createImportPackageCommandApi } from "./importPackage.js";
import { createMediaResourceCommandApi } from "./media.js";

export const createResourceCommandApi = (shared) => ({
  ...createMediaResourceCommandApi(shared),
  ...createCatalogResourceCommandApi(shared),
  ...createImportPackageCommandApi(shared),
});
