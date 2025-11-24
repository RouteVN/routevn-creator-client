// Web project initialization - follows the same logic as Tauri
import { loadTemplate, getTemplateFiles } from "../utils/templateLoader";

/**
 * Initialize web project with template data (for first-time users)
 * This follows the exact same logic as Tauri's initializeProject,
 * but stores files in IndexedDB instead of file system
 */
export const initializeWebProject = async ({
  repositoryFactory,
  storageAdapterFactory,
  template = "default",
}) => {
  // Get repository for the single web project
  const repository = await repositoryFactory.getByProject();

  // Check if already initialized
  const actionStream = repository.getEvents();
  if (actionStream.length > 0) {
    return; // Already initialized
  }

  console.log("First time user - loading template data...");

  // Load template data from static files
  const templateData = await loadTemplate(template);

  // Copy template files to IndexedDB (using the same filenames as in template)
  const storageAdapter = await storageAdapterFactory.getByProject();
  await copyTemplateFilesToIndexedDB(template, storageAdapter);

  // Initialize repository with template data (no modifications needed)
  await repository.addEvent({
    type: "init",
    payload: {
      target: null,
      value: templateData,
    },
  });

  console.log("Template data loaded and saved to repository");
};

/**
 * Copy template files to IndexedDB, keeping original filenames
 * This mirrors Tauri's copyTemplateFiles but stores in IndexedDB
 */
async function copyTemplateFilesToIndexedDB(templateId, storageAdapter) {
  const templateFilesPath = `/templates/${templateId}/files/`;
  const filesToCopy = await getTemplateFiles(templateId);

  for (const fileName of filesToCopy) {
    try {
      const sourcePath = templateFilesPath + fileName;

      // Fetch the file (add ?raw to bypass Vite's JS parsing)
      const response = await fetch(sourcePath + "?raw");
      if (response.ok) {
        const blob = await response.blob();

        // Create a File object with the exact template filename
        // This ensures the fileId matches what's in the template
        const file = new File([blob], fileName, { type: blob.type });

        // Store in IndexedDB using the storage adapter
        // The adapter should use the filename (without extension) as the fileId
        await storageAdapter.storeFile(file);
      }
    } catch (error) {
      console.error(`Failed to copy template file ${fileName}:`, error);
    }
  }
}
