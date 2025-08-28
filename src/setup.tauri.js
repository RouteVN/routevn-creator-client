// Tauri-specific setup
import { setupCommon } from "./setup.common";

// Check if running in Tauri
const isTauri = window.__TAURI__ !== undefined;

// Tauri-specific configuration
const tauriConfig = {
  platform: "tauri",
  // In Tauri, we might want to use a different backend URL or use Tauri's IPC
  baseUrl: "http://localhost:8788",
  headers: {
    // Additional Tauri-specific headers if needed
  },
  // Could use a different storage adapter for Tauri if needed
  // For example, could implement a TauriStorageAdapter that uses Tauri's file system
};

// Log Tauri detection
if (isTauri) {
  console.log("Running in Tauri environment");
  
  // Example: Access Tauri APIs if needed
  // const { invoke } = window.__TAURI__.core;
  // const { fs } = window.__TAURI__;
  
  // Could set up Tauri-specific event listeners
  // window.__TAURI__.event.listen('tauri://file-drop', (event) => {
  //   console.log('Files dropped:', event.payload);
  // });
} else {
  console.warn("Tauri API not detected, but using Tauri configuration");
}

// Initialize with Tauri-specific config
const { h, patch, deps } = await setupCommon(tauriConfig);

// Add Tauri-specific utilities to deps if needed
if (isTauri) {
  // Example: Add Tauri API access to dependencies
  deps.components.tauriApi = window.__TAURI__;
  deps.pages.tauriApi = window.__TAURI__;
}

// Export for the application
export { h, patch, deps };