import { invoke } from "@tauri-apps/api/core";

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

  // Use custom Rust commands for project-specific database
  await invoke("open_project_db", { projectPath });

  return {
    async addAction(action) {
      await invoke("add_project_action", {
        projectPath,
        action: {
          action_type: action.actionType,
          target: action.target,
          value: JSON.stringify(action.value),
        },
      });
    },

    async getAllEvents() {
      const results = await invoke("get_project_events", { projectPath });
      return results.map((row) => ({
        actionType: row.action_type,
        target: row.target,
        value: row.value ? JSON.parse(row.value) : null,
      }));
    },

    async close() {
      await invoke("close_project_db", { projectPath });
    },
  };
};
