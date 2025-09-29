import { nanoid } from "nanoid";
import { constructResources } from "../../utils/resourcesConstructor.js";
import {
  constructStory,
  getInitialSceneId,
} from "../../utils/storyConstructor.js";

export const handleAfterMount = async (deps) => {
  const { store, render, router, repositoryFactory } = deps;
  const { p } = router.getPayload();

  // Load projects and get versions for current project
  const repository = await repositoryFactory.getByProject(p);
  const versions = (await repository.app.get("versions")) || [];
  store.setVersions(versions);

  render();
};

export const handleDataChanged = () => {};

export const handleSaveVersionClick = (_, deps) => {
  const { store, render } = deps;
  store.setShowVersionForm(true);
  render();
};

export const handleVersionFormClose = (_, deps) => {
  const { store, render } = deps;
  store.resetVersionForm();
  render();
};

export const handleVersionFormAction = async (e, deps) => {
  const { store, render, repositoryFactory, router, projectsService } = deps;
  const { p } = router.getPayload();
  const actionId = e.detail.actionId;

  if (actionId === "cancel") {
    store.resetVersionForm();
    render();
  } else if (actionId === "submit") {
    const formData = e.detail.formValues;
    const repository = await repositoryFactory.getByProject(p);

    // Get current action count from repository
    const allEvents = repository.getAllEvents();
    const currentActionIndex = allEvents.length;

    // Create simple version object
    const newVersion = {
      id: nanoid(),
      name: formData.name,
      actionIndex: currentActionIndex,
      createdAt: new Date().toISOString(),
    };

    // Save version to project
    await projectsService.addVersionToProject(p, newVersion);

    // Update UI
    store.addVersion(newVersion);
    store.resetVersionForm();
    render();
  }
};

export const handleVersionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  const versionId = e.currentTarget.id.replace("version-", "");
  const versions = store.selectVersions();
  const version = versions.find((v) => v.id === versionId);

  if (!version) {
    return;
  }

  store.openDropdownMenu({
    x: e.clientX,
    y: e.clientY,
    versionId: versionId,
  });
  render();
};

export const handleDropdownMenuClose = (_, deps) => {
  const { store, render } = deps;
  store.closeDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (e, deps) => {
  const {
    store,
    render,
    projectsService,
    router,
    bundleService,
    repositoryFactory,
    fileManagerFactory,
    globalUI,
  } = deps;
  const detail = e.detail;

  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item || detail;

  if (item.value === "bundle") {
    // Handle Create Bundle action
    const versionId = store.selectDropdownMenuTargetVersionId();
    const version = store.selectVersion(versionId);

    if (!version) {
      console.warn("Version not found for bundle creation:", versionId);
      store.closeDropdownMenu();
      render();
      return;
    }

    // Close dropdown
    store.closeDropdownMenu();
    render();

    // Get project id from router
    const { p } = router.getPayload();
    const repository = await repositoryFactory.getByProject(p);
    const fileManager = await fileManagerFactory.getByProject(p);

    // Get state at specific action
    const projectData = repository.getState(version.actionIndex);

    // Transform projectData to the required format
    const transformedData = {
      projectData: {
        screen: {
          width: 1920,
          height: 1080,
          backgroundColor: "#000000",
        },
        resources: constructResources(projectData),
        story: {
          initialSceneId: getInitialSceneId(projectData.scenes),
          scenes: constructStory(projectData.scenes),
        },
      },
    };

    // Collect all fileIds from original project data
    const fileIds = [];
    const extractFileIds = (obj) => {
      if (obj.fileId) fileIds.push(obj.fileId);
      if (obj.iconFileId) fileIds.push(obj.iconFileId);
      Object.values(obj).forEach((value) => {
        if (typeof value === "object" && value !== null) extractFileIds(value);
      });
    };
    extractFileIds(projectData);

    // Fetch files as buffers
    const files = {};
    for (const fileId of fileIds) {
      try {
        const content = await fileManager.getFileContent({ fileId });
        const response = await fetch(content.url);
        const buffer = await response.arrayBuffer();
        files[fileId] = {
          buffer: new Uint8Array(buffer),
          mime: content.type,
        };
      } catch (error) {
        console.warn(`Failed to fetch file ${fileId}:`, error);
      }
    }

    // Create bundle with transformed data
    const bundle = await bundleService.exportProject(transformedData, files);
    const zipName = `${projectData.project.name}_${version.name}`;

    console.log(
      `✓ Bundle created: package.vnbundle (${(bundle.length / 1024).toFixed(1)} KB)`,
    );

    // Create and download ZIP with bundle and static files
    await bundleService.createDistributionZip(bundle, zipName);

    console.log(`✓ Distribution ZIP created: ${zipName}.zip`);
    globalUI.showAlert({
      message: `Bundle ${zipName}.zip created and downloaded. You can find it in your Downloads folder.`,
      title: "Success",
    });
  }

  if (item.value !== "delete") {
    // Hide dropdown for other non-delete actions
    store.closeDropdownMenu();
    render();
    return;
  }

  // Get versionId BEFORE closing dropdown (important!)
  const versionId = store.selectDropdownMenuTargetVersionId();

  if (!versionId) {
    console.warn("No versionId found for deletion");
    store.closeDropdownMenu();
    render();
    return;
  }

  const version = store.selectVersion(versionId);

  if (!version) {
    console.warn("Version not found for deletion:", versionId);
    store.closeDropdownMenu();
    render();
    return;
  }

  // Close dropdown
  store.closeDropdownMenu();
  render();

  // Get project id from router
  const { p } = router.getPayload();

  // Delete the version entry using service
  await projectsService.deleteVersionFromProject(p, versionId);

  // Update store by removing from current versions
  store.deleteVersion(versionId);
  render();
};
