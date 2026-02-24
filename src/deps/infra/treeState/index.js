/**
 * Insieme - Foundational library for building collaborative, consistent state
 *
 * This is the main entry point for the Insieme library, providing exports for:
 * - Repository factory functions for different environments
 * - Core actions for state manipulation
 * - Helper functions for tree data structure operations
 */

// Repository factories
export { createRepository } from "./repository.js";

// Validation utilities
export { EventValidationError } from "./validation.js";

// Helper functions for tree operations
export { toFlatItems, toFlatGroups, toTreeStructure } from "./helpers.js";
