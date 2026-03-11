import { createBundle } from "../../../internal/projectBundle.js";

const getBundleStaticFiles = async () => {
  let indexHtml;
  let mainJs;

  try {
    const indexResponse = await fetch("/bundle/index.html");
    if (indexResponse.ok) {
      indexHtml = await indexResponse.text();
    }

    const mainJsResponse = await fetch("/bundle/main.js");
    if (mainJsResponse.ok) {
      mainJs = await mainJsResponse.text();
    }
  } catch (error) {
    console.error("Failed to fetch static bundle files:", error);
  }

  return { indexHtml, mainJs };
};

export const createProjectExportService = ({
  fileAdapter,
  filePicker,
  getCurrentReference,
  getFileContent,
}) => {
  return {
    createBundle(projectData, assets) {
      return createBundle(projectData, assets);
    },

    exportProject(projectData, files) {
      return createBundle(projectData, files);
    },

    async downloadBundle(bundle, filename, options = {}) {
      return fileAdapter.downloadBundle({
        bundle,
        filename,
        options,
        filePicker,
      });
    },

    async createDistributionZip(bundle, zipName, options = {}) {
      return fileAdapter.createDistributionZip({
        bundle,
        zipName,
        options,
        filePicker,
        staticFiles: await getBundleStaticFiles(),
      });
    },

    async createDistributionZipStreamed(
      projectData,
      fileIds,
      zipName,
      options = {},
    ) {
      return fileAdapter.createDistributionZipStreamed({
        projectData,
        fileIds,
        zipName,
        options,
        filePicker,
        staticFiles: await getBundleStaticFiles(),
        getCurrentReference,
        getFileContent,
      });
    },
  };
};
