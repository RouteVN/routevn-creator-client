import { mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import { loadTemplate, getTemplateFiles } from "../utils/templateLoader";

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
  const adapter = await createInsiemeTauriStoreAdapter(projectPath);

  // Load template data from static files
  const templateData = await loadTemplate(template);

  // Copy template files to project directory with random file IDs
  await copyTemplateFiles(template, filesPath);

  // Add project info to template data
  const initData = {
    ...templateData,
    project: {
      name,
      description,
    },
  };

  // Add the init action directly through adapter (temporary - will be replaced with insieme)
  await adapter.appendEvent({
    type: "init",
    payload: {
      value: initData,
    },
  });

  // Set creator_version to 1 in app table
  await adapter.app.set("creator_version", "1");
};

async function copyTemplateFiles(templateId, targetPath) {
  // Get the path to template files
  const templateFilesPath = `/templates/${templateId}/files/`;

  // List of files to copy (hardcoded for now, could be made dynamic)
  const filesToCopy = await getTemplateFiles(templateId);

  for (const fileName of filesToCopy) {
    try {
      const sourcePath = templateFilesPath + fileName;

      const targetFilePath = await join(targetPath, fileName);

      // Fetch from the web server and save locally
      // Add a query parameter to bypass Vite's JS parsing
      const response = await fetch(sourcePath + "?raw");
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
}

/**
 * Insieme-compatible Tauri SQLite Store Adapter
 * @param {string} projectPath - Required project path for project-specific database
 */
export const createInsiemeTauriStoreAdapter = async (projectPath) => {
  if (!projectPath) {
    throw new Error(
      "Project path is required. Database must be stored in project folder.",
    );
  }

  const dbPath = await join(projectPath, "repository.db");
  const db = await Database.load(`sqlite:${dbPath}`);

  await db.execute(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    payload TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);

  await db.execute(`CREATE TABLE IF NOT EXISTS app (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  return {
    // Insieme store interface
    async getEvents() {
      const results = await db.select(
        "SELECT type, payload FROM events ORDER BY id",
      );
      return results.map((row) => ({
        type: row.type,
        payload: row.payload ? JSON.parse(row.payload) : null,
      }));
    },

    async appendEvent(event) {
      await db.execute("INSERT INTO events (type, payload) VALUES (?, ?)", [
        event.type,
        JSON.stringify(event.payload),
      ]);
    },

    // Preserve app methods for compatibility
    app: {
      get: async (key) => {
        const result = await db.select("SELECT value FROM app WHERE key = $1", [
          key,
        ]);
        if (result && result.length > 0) {
          try {
            return JSON.parse(result[0].value);
          } catch {
            return result[0].value;
          }
        }
        return null;
      },
      set: async (key, value) => {
        const jsonValue = JSON.stringify(value);
        await db.execute(
          "INSERT OR REPLACE INTO app (key, value) VALUES ($1, $2)",
          [key, jsonValue],
        );
      },
      remove: async (key) => {
        await db.execute("DELETE FROM app WHERE key = $1", [key]);
      },
    },
  };
};
