import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import { loadTemplate } from "../utils/templateLoader";
import { nanoid } from "nanoid";

/**
 * Initialize a new project with folder structure and database
 */
export const initializeProject = async ({
  name,
  description,
  projectPath,
  template,
}) => {
  if (!template) {
    throw new Error("Template is required for project initialization");
  }

  // Create project folders
  const filesPath = await join(projectPath, "files");
  await mkdir(filesPath, { recursive: true });

  // Initialize database
  const adapter = await createTauriSQLiteRepositoryAdapter(projectPath);

  // Load template data from static files
  const templateData = await loadTemplate(template);

  // Copy template files to project directory with random file IDs
  const fileMapping = await copyTemplateFiles(template, filesPath);

  // Update image items with new file IDs (keep imageId unchanged)
  if (templateData.images && templateData.images.items) {
    for (const [imageId, image] of Object.entries(templateData.images.items)) {
      const originalFileName = image.filename;
      const newFileId = fileMapping[originalFileName];
      if (newFileId) {
        // imageId stays the same, only update the fileId reference
        const fullPath = await join(filesPath, newFileId);
        image.filename = newFileId;
        image.url = convertFileSrc(fullPath);
      }
    }
  }

  // Update font items with new file IDs (keep fontId unchanged)
  if (templateData.fonts && templateData.fonts.items) {
    for (const [fontId, font] of Object.entries(templateData.fonts.items)) {
      const originalFileName = font.filename;
      const newFileId = fileMapping[originalFileName];
      if (newFileId) {
        // fontId stays the same, only update the fileId reference
        const fullPath = await join(filesPath, newFileId);
        font.filename = newFileId;
        font.url = convertFileSrc(fullPath);
      }
    }
  }

  // Add project info to template data
  const initData = {
    ...templateData,
    project: {
      name,
      description,
    },
  };

  // Add the init action directly through adapter
  await adapter.addAction({
    actionType: "init",
    target: null,
    value: initData,
  });
};

async function copyTemplateFiles(templateId, targetPath) {
  // Get the path to template files
  const templateFilesPath = `/templates/${templateId}/files/`;

  // List of files to copy (hardcoded for now, could be made dynamic)
  const filesToCopy = [
    "dialogue_box.png",
    "choice_box.png",
    "choice_box_activated.png",
    "sample_font.ttf",
  ];

  // Map original filenames to new random file IDs
  const fileMapping = {};

  for (const fileName of filesToCopy) {
    try {
      const sourcePath = templateFilesPath + fileName;

      // Generate random file ID (no extension)
      const newFileId = nanoid();
      fileMapping[fileName] = newFileId;

      const targetFilePath = await join(targetPath, newFileId);

      // Fetch from the web server and save locally
      const response = await fetch(sourcePath);
      if (response.ok) {
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Write file using Tauri's file system API
        await writeFile(targetFilePath, uint8Array);
      }
    } catch (error) {
      console.error(`Failed to copy template file ${fileName}:`, error);
    }
  }

  return fileMapping;
}

/**
 * Tauri SQLite Repository Adapter
 * @param {string} projectPath - Required project path for project-specific database
 */
export const createTauriSQLiteRepositoryAdapter = async (projectPath) => {
  if (!projectPath) {
    throw new Error(
      "Project path is required. Database must be stored in project folder.",
    );
  }

  const dbPath = await join(projectPath, "repository.db");
  const db = await Database.load(`sqlite:${dbPath}`);

  await db.execute(`CREATE TABLE IF NOT EXISTS actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    target TEXT,
    value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  return {
    async addAction(action) {
      await db.execute(
        "INSERT INTO actions (action_type, target, value) VALUES (?, ?, ?)",
        [
          action.actionType,
          action.target || null,
          JSON.stringify(action.value),
        ],
      );
    },

    async getAllEvents() {
      const results = await db.select(
        "SELECT action_type, target, value FROM actions ORDER BY id",
      );
      return results.map((row) => ({
        actionType: row.action_type,
        target: row.target,
        value: row.value ? JSON.parse(row.value) : null,
      }));
    },
  };
};
