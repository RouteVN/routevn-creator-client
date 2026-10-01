import { invoke } from "@tauri-apps/api/core";

class RouteVNTestCrash extends Error {
  name = "RouteVNTestCrash";
}

// Fails on purpose so desktop error reporting can be checked on release builds.
// Only a project created with a test crash name reaches this (see
// src/internal/testCrashes.js). Returns false for kinds the desktop app does
// not report, so the app carries on normally.
export const triggerTestCrash = async (kind) => {
  if (kind === "app") {
    // Thrown outside any caller, so the global handler reports it as uncaught.
    setTimeout(() => {
      throw new RouteVNTestCrash("RouteVN test crash");
    });
    return true;
  }

  return invoke("trigger_test_crash", { kind });
};
