export const handleBeforeMount = (deps) => {
  // Initialize settings
};

export const handleAfterMount = async (deps) => {
  const { store, render, appVersion } = deps;

  // Set app version from deps
  if (appVersion) {
    store.setAppVersion(appVersion);
  }

  render();
};

export const handleDataChanged = (e, deps) => {
  const { store } = deps;
  // Handle file explorer data changes
};

export const handleCheckForUpdates = async (payload, deps) => {
  const { updaterService } = deps;

  // Check for updates with UI feedback
  await updaterService.checkForUpdates(false);
};

export const handleBackToProjects = async (e, deps) => {
  const { subject } = deps;

  // Navigate back to projects page
  subject.dispatch("redirect", {
    path: "/projects",
  });
};

export const handleCreateBundle = async (e, deps) => {
  const { bundleService, repositoryFactory, router, fileManagerFactory } = deps;

  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const projectData = repository.getState();
  const fileManager = await fileManagerFactory.getByProject(p);

  // Collect all fileIds from project data
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
    const content = await fileManager.getFileContent({ fileId });
    const response = await fetch(content.url);
    const buffer = await response.arrayBuffer();
    files[fileId] = {
      buffer: new Uint8Array(buffer),
      mime: content.type,
    };
  }

  // Create bundle with files
  const bundle = await bundleService.exportProject(projectData, files);
  const fileName = `${projectData.project.name}.vnbundle`;

  console.log(
    `✓ Bundle created: ${fileName} (${(bundle.length / 1024).toFixed(1)} KB)`,
  );

  bundleService.downloadBundle(bundle, fileName);
};

export const handleFileSelected = async (e, deps) => {
  const { bundleService } = deps;
  const files = e.detail?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const arrayBuffer = await file.arrayBuffer();

  // Extract bundle without importing
  const { assets, instructions } =
    await bundleService.extractBundle(arrayBuffer);

  console.log("\n=== Bundle Contents ===");
  console.log("Project:", instructions.project?.name || "Unknown");
  console.log("\nMetadata:");
  console.log(instructions);
  console.log("\nAssets:", Object.keys(assets).length);

  // List all assets
  if (Object.keys(assets).length > 0) {
    console.log("\nAsset list:");
    Object.entries(assets).forEach(([id, asset]) => {
      console.log(`  - ${id}: ${asset.type} (${asset.buffer.length} bytes)`);
    });
  }

  console.log("===================\n");
};
