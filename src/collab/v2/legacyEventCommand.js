import { createCommandEnvelope } from "./commandEnvelope.js";

const RESOURCE_ROOTS = new Set([
  "images",
  "tweens",
  "sounds",
  "videos",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "typography",
  "components",
]);

const firstString = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
};

const extractNodeId = (event) => {
  const payload = event?.payload || {};
  return firstString(
    payload?.options?.id,
    payload?.value?.id,
    payload?.value?.item?.id,
    payload?.value?.value?.id,
  );
};

const targetParts = (event) => {
  const target = event?.payload?.target;
  if (typeof target !== "string" || target.length === 0) return [];
  return target.split(".");
};

const resolveScopeFromEvent = (event) => {
  const parts = targetParts(event);
  if (parts.length === 0) {
    return "settings";
  }

  const root = parts[0];
  if (root === "scenes" || root === "story") return "story";
  if (root === "layouts") return "layouts";
  if (RESOURCE_ROOTS.has(root)) return "resources";
  if (root === "project" || root === "variables") return "settings";
  return "settings";
};

const resolveEntityPartitionSuffix = (event) => {
  const payload = event?.payload || {};
  const parts = targetParts(event);
  if (parts.length === 0) return null;

  const root = parts[0];
  const explicitId = extractNodeId(event);

  if (root === "scenes") {
    if (parts[1] === "items" && parts[2]) {
      const sceneId = parts[2];
      if (parts[3] === "sections") {
        if (parts[4] === "items" && parts[5]) {
          const sectionId = parts[5];
          if (parts[6] === "lines") {
            const lineId =
              (parts[7] === "items" && parts[8]) || explicitId || null;
            if (lineId) return `line:${lineId}`;
            return `section:${sectionId}`;
          }
          return `section:${sectionId}`;
        }
        if (explicitId) return `section:${explicitId}`;
      }
      return `scene:${sceneId}`;
    }

    if (explicitId) return `scene:${explicitId}`;
    return null;
  }

  if (root === "story" && parts[1] === "initialSceneId") {
    const initialSceneId =
      typeof payload?.value === "string" && payload.value.length > 0
        ? payload.value
        : null;
    if (initialSceneId) return `scene:${initialSceneId}`;
    return null;
  }

  if (root === "layouts") {
    if (parts[1] === "items" && parts[2]) {
      const layoutId = parts[2];
      if (parts[3] === "elements") {
        const elementId =
          (parts[4] === "items" && parts[5]) || explicitId || null;
        if (elementId) return `layout:${layoutId}:element:${elementId}`;
        return `layout:${layoutId}`;
      }
      return `layout:${layoutId}`;
    }
    if (explicitId) return `layout:${explicitId}`;
    return null;
  }

  if (root === "characters" && parts[1] === "items" && parts[2]) {
    const characterId = parts[2];
    if (parts[3] === "sprites") {
      const spriteId = (parts[4] === "items" && parts[5]) || explicitId || null;
      if (spriteId) return `character:${characterId}:sprite:${spriteId}`;
      return `character:${characterId}:sprites`;
    }
    return `character:${characterId}`;
  }

  if (RESOURCE_ROOTS.has(root)) {
    if (explicitId) return `${root}:${explicitId}`;
    return null;
  }

  if (root === "project") {
    if (parts[1]) return `project_field:${parts[1]}`;
    return null;
  }

  if (root === "variables") {
    if (explicitId) return `variable:${explicitId}`;
    return null;
  }

  return null;
};

export const createLegacyEventCommand = ({
  projectId,
  actor,
  event,
  commandId,
}) => {
  const scope = resolveScopeFromEvent(event);
  const basePartition = `project:${projectId}:${scope}`;
  const suffix = resolveEntityPartitionSuffix(event);
  const partitions = suffix
    ? [basePartition, `${basePartition}:${suffix}`]
    : [basePartition];

  return createCommandEnvelope({
    id: commandId,
    projectId,
    scope,
    partition: basePartition,
    partitions,
    type: "legacy.event.apply",
    payload: {
      event: structuredClone(event),
    },
    actor,
  });
};
