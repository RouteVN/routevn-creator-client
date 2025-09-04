import { mkdir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import Database from "@tauri-apps/plugin-sql";
import {
  fetchTemplateImages,
  fetchTemplateFonts,
} from "../utils/templateSetup";
import { createTemplateProjectData } from "../utils/templateProjectData";

/**
 * Initialize a new project with folder structure and database
 */
export const initializeProject = async ({
  name,
  description,
  projectPath,
  template,
  uploadImageFiles,
  uploadFontFiles,
}) => {
  // Create project folders
  const filesPath = await join(projectPath, "files");
  await mkdir(filesPath, { recursive: true });

  // Initialize database
  if (template === "default") {
    // Directly create adapter and use it to initialize database
    const adapter = await createTauriSQLiteRepositoryAdapter(projectPath);

    // Fetch template resources
    const templateImagesData = await fetchTemplateImages(uploadImageFiles);
    const templateFontsData = await fetchTemplateFonts(uploadFontFiles);

    // Create template data
    const templateData = createTemplateProjectData(
      templateImagesData.fetchedImages,
      templateFontsData.fetchedFonts,
    );

    // Prepare init data
    const initData = {
      project: {
        name,
        description,
      },
      images: {
        items: templateImagesData.imageItems,
        tree: templateImagesData.imageTree,
      },
      fonts: {
        items: {
          ...templateFontsData.fontItems,
          ...templateData.fonts.items,
        },
        tree: [...templateFontsData.fontTree, ...templateData.fonts.tree],
      },
      animations: templateData.animations,
      transforms: templateData.transforms,
      layouts: templateData.layouts,
      scenes: templateData.scenes,
    };

    // Add the init action directly through adapter
    await adapter.addAction({
      actionType: "init",
      target: null,
      value: initData,
    });
  } else {
    // Just initialize empty database
    const dbPath = await join(projectPath, "repository.db");
    const db = await Database.load(`sqlite:${dbPath}`);

    // Create actions table
    await db.execute(`CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action_type TEXT NOT NULL,
      target TEXT,
      value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
  }
};

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
