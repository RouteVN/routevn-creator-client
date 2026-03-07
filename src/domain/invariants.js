import { DomainInvariantError } from "./errors.js";
import { MODEL_VERSION, RESOURCE_TYPES } from "./constants.js";
import { assertFiniteNumber } from "./utils.js";

const fail = (message, details = {}) => {
  throw new DomainInvariantError(message, details);
};

const ensureUnique = (array, label) => {
  const set = new Set(array);
  if (set.size !== array.length) {
    fail(`Duplicate ids in ${label}`, { label, array });
  }
};

const walkHierarchy = (nodes, parentId, visitor) => {
  if (!Array.isArray(nodes)) return;
  for (const node of nodes) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) {
      fail("Invalid hierarchy node", { node, parentId });
    }
    visitor(node, parentId);
    walkHierarchy(node.children || [], node.id, visitor);
  }
};

const validateHierarchicalCollection = ({
  collection,
  collectionLabel,
  itemLabel,
}) => {
  if (
    !collection ||
    typeof collection !== "object" ||
    !collection.items ||
    typeof collection.items !== "object" ||
    !Array.isArray(collection.tree)
  ) {
    fail("Collection shape is invalid", { collectionLabel });
  }

  const parentById = new Map();
  walkHierarchy(collection.tree, null, (node, parentId) => {
    if (parentById.has(node.id)) {
      fail("Duplicate node id in tree", {
        collectionLabel,
        itemLabel,
        id: node.id,
      });
    }
    parentById.set(node.id, parentId);
  });

  for (const [id, parentId] of parentById.entries()) {
    if (!collection.items[id]) {
      fail("Tree references missing item", {
        collectionLabel,
        itemLabel,
        id,
        parentId,
      });
    }
  }

  for (const [id, item] of Object.entries(collection.items || {})) {
    if (!parentById.has(id)) {
      fail("Item missing from tree", {
        collectionLabel,
        itemLabel,
        id,
      });
    }
    const expectedParentId = parentById.get(id) ?? null;
    const actualParentId =
      typeof item?.parentId === "string" && item.parentId.length > 0
        ? item.parentId
        : null;
    if (actualParentId !== expectedParentId) {
      fail("Item parent mismatch with tree", {
        collectionLabel,
        itemLabel,
        id,
        expectedParentId,
        actualParentId,
      });
    }
  }
};

const validateLineActionReferences = (state) => {
  for (const line of Object.values(state.lines)) {
    const actions = line.actions || {};
    const sectionTransition =
      actions.sectionTransition || actions.actions?.sectionTransition;
    if (
      sectionTransition?.sceneId &&
      !state.scenes[sectionTransition.sceneId]
    ) {
      fail("Line references missing scene", {
        lineId: line.id,
        sceneId: sectionTransition.sceneId,
      });
    }

    const background = actions.background || actions.actions?.background;
    if (background?.resourceType === "layout" && background.resourceId) {
      if (!state.layouts[background.resourceId]) {
        fail("Line references missing layout", {
          lineId: line.id,
          layoutId: background.resourceId,
        });
      }
    }
  }
};

const validateLayoutElementReferences = (state) => {
  for (const layout of Object.values(state.layouts)) {
    ensureUnique(
      layout.rootElementOrder || [],
      `layout(${layout.id}).rootElementOrder`,
    );

    const placementCount = new Map();
    const bumpPlacement = (id) => {
      placementCount.set(id, (placementCount.get(id) || 0) + 1);
    };

    for (const rootId of layout.rootElementOrder || []) {
      if (!layout.elements[rootId]) {
        fail("Layout root references missing element", {
          layoutId: layout.id,
          rootId,
        });
      }
      bumpPlacement(rootId);
    }

    for (const element of Object.values(layout.elements || {})) {
      ensureUnique(
        element.children || [],
        `layout(${layout.id}).element(${element.id}).children`,
      );

      if (element.parentId) {
        const parent = layout.elements[element.parentId];
        if (!parent) {
          fail("Layout element references missing parent", {
            layoutId: layout.id,
            elementId: element.id,
            parentId: element.parentId,
          });
        }
        if (!(parent.children || []).includes(element.id)) {
          fail("Layout parent does not reference child", {
            layoutId: layout.id,
            elementId: element.id,
            parentId: element.parentId,
          });
        }
      }

      for (const childId of element.children || []) {
        if (!layout.elements[childId]) {
          fail("Layout element references missing child", {
            layoutId: layout.id,
            elementId: element.id,
            childId,
          });
        }
        if (layout.elements[childId].parentId !== element.id) {
          fail("Layout child parent mismatch", {
            layoutId: layout.id,
            elementId: element.id,
            childId,
            actualParentId: layout.elements[childId].parentId,
          });
        }
        bumpPlacement(childId);
      }

      for (const numericKey of [
        "x",
        "y",
        "width",
        "height",
        "rotation",
        "opacity",
      ]) {
        if (
          Object.prototype.hasOwnProperty.call(element, numericKey) &&
          !assertFiniteNumber(element[numericKey])
        ) {
          fail("Invalid numeric layout property", {
            layoutId: layout.id,
            elementId: element.id,
            key: numericKey,
            value: element[numericKey],
          });
        }
      }

      if (
        element.opacity !== undefined &&
        (element.opacity < 0 || element.opacity > 1)
      ) {
        fail("Layout opacity out of range", {
          layoutId: layout.id,
          elementId: element.id,
          opacity: element.opacity,
        });
      }
    }

    for (const elementId of Object.keys(layout.elements || {})) {
      const placements = placementCount.get(elementId) || 0;
      if (placements !== 1) {
        fail("Layout element must appear exactly once in order", {
          layoutId: layout.id,
          elementId,
          placements,
        });
      }
    }

    const visited = new Set();
    const visiting = new Set();
    const roots = layout.rootElementOrder || [];

    const walk = (id, path = []) => {
      if (visiting.has(id)) {
        fail("Layout cycle detected", {
          layoutId: layout.id,
          path: [...path, id],
        });
      }
      if (visited.has(id)) return;

      visiting.add(id);
      const node = layout.elements[id];
      if (!node) {
        fail("Layout traversal missing element", {
          layoutId: layout.id,
          elementId: id,
        });
      }

      for (const childId of node.children || []) {
        walk(childId, [...path, id]);
      }

      visiting.delete(id);
      visited.add(id);
    };

    for (const rootId of roots) {
      walk(rootId);
    }

    const totalElements = Object.keys(layout.elements || {}).length;
    if (visited.size !== totalElements) {
      const unreachable = Object.keys(layout.elements || {}).filter(
        (id) => !visited.has(id),
      );
      fail("Layout has unreachable elements", {
        layoutId: layout.id,
        unreachable,
      });
    }
  }
};

export const assertDomainInvariants = (state) => {
  if (state.model_version !== MODEL_VERSION) {
    fail("Unsupported model version", {
      expected: MODEL_VERSION,
      got: state.model_version,
    });
  }

  if (!state?.project?.id) {
    fail("Missing project id");
  }

  for (const resourceType of RESOURCE_TYPES) {
    if (!state.resources?.[resourceType]) {
      fail("Missing resource collection", { resourceType });
    }
  }

  for (const resourceType of Object.keys(state.resources || {})) {
    if (!RESOURCE_TYPES.includes(resourceType)) {
      fail("Unknown resource collection", { resourceType });
    }
  }

  ensureUnique(state.story.sceneOrder || [], "story.sceneOrder");

  if (state.story.initialSceneId && !state.scenes[state.story.initialSceneId]) {
    fail("initialSceneId does not exist", {
      initialSceneId: state.story.initialSceneId,
    });
  }

  for (const sceneId of state.story.sceneOrder) {
    if (!state.scenes[sceneId]) {
      fail("sceneOrder contains missing scene", { sceneId });
    }
  }

  for (const scene of Object.values(state.scenes)) {
    ensureUnique(scene.sectionIds || [], `scene(${scene.id}).sectionIds`);
    for (const sectionId of scene.sectionIds || []) {
      const section = state.sections[sectionId];
      if (!section) {
        fail("Scene references missing section", {
          sceneId: scene.id,
          sectionId,
        });
      }
      if (section.sceneId !== scene.id) {
        fail("Section parent mismatch", {
          sceneId: scene.id,
          sectionId,
          actualSceneId: section.sceneId,
        });
      }
    }
  }

  for (const section of Object.values(state.sections)) {
    if (!state.scenes[section.sceneId]) {
      fail("Section references missing parent scene", {
        sectionId: section.id,
        sceneId: section.sceneId,
      });
    }
    if (
      !(state.scenes[section.sceneId].sectionIds || []).includes(section.id)
    ) {
      fail("Section parent does not include section id", {
        sectionId: section.id,
        sceneId: section.sceneId,
      });
    }

    ensureUnique(section.lineIds || [], `section(${section.id}).lineIds`);
    for (const lineId of section.lineIds || []) {
      const line = state.lines[lineId];
      if (!line) {
        fail("Section references missing line", {
          sectionId: section.id,
          lineId,
        });
      }
      if (line.sectionId !== section.id) {
        fail("Line parent mismatch", {
          sectionId: section.id,
          lineId,
          actualSectionId: line.sectionId,
        });
      }
    }
  }

  for (const line of Object.values(state.lines)) {
    if (!state.sections[line.sectionId]) {
      fail("Line references missing parent section", {
        lineId: line.id,
        sectionId: line.sectionId,
      });
    }
    if (!(state.sections[line.sectionId].lineIds || []).includes(line.id)) {
      fail("Line parent does not include line id", {
        lineId: line.id,
        sectionId: line.sectionId,
      });
    }
  }

  for (const [resourceType, collection] of Object.entries(
    state.resources || {},
  )) {
    validateHierarchicalCollection({
      collection,
      collectionLabel: `resources.${resourceType}`,
      itemLabel: "resource",
    });
  }

  const variables = state.variables;
  validateHierarchicalCollection({
    collection: variables,
    collectionLabel: "variables",
    itemLabel: "variable",
  });

  for (const [variableId, variable] of Object.entries(variables?.items || {})) {
    const parentId = variable?.parentId;
    if (parentId === undefined || parentId === null || parentId === "") {
      continue;
    }
    if (parentId === variableId) {
      fail("Variable cannot reference itself as parent", { variableId });
    }
    if (!variables.items[parentId]) {
      fail("Variable parent reference missing", { variableId, parentId });
    }
  }

  validateLineActionReferences(state);
  validateLayoutElementReferences(state);

  return true;
};
