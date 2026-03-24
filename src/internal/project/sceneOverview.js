import { normalizeLineActions } from "./engineActions.js";
import { getInteractionActions } from "./interactionPayload.js";
import { toFlatItems } from "./tree.js";

const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

const getTransitionsFromLayout = (layout, menuSceneId) => {
  const transitions = new Set();
  let returnsToMenuScene = false;

  if (!layout?.elements?.items) {
    return {
      sceneIds: [],
      returnsToMenuScene,
    };
  }

  for (const element of Object.values(layout.elements.items)) {
    const sceneIds = [
      getInteractionActions(element?.click).sectionTransition?.sceneId,
      getInteractionActions(element?.rightClick).sectionTransition?.sceneId,
    ];

    for (const sceneId of sceneIds) {
      if (!isNonEmptyString(sceneId)) {
        continue;
      }

      transitions.add(sceneId);
      if (sceneId === menuSceneId) {
        returnsToMenuScene = true;
      }
    }
  }

  return {
    sceneIds: [...transitions],
    returnsToMenuScene,
  };
};

const resolveLayoutReference = ({ ref, layouts, controls }) => {
  if (!ref?.resourceId) {
    return undefined;
  }

  if (ref.resourceType === "control") {
    return controls?.items?.[ref.resourceId];
  }

  if (ref.resourceType === "layout") {
    return layouts?.items?.[ref.resourceId];
  }

  return layouts?.items?.[ref.resourceId] || controls?.items?.[ref.resourceId];
};

const toSectionLines = (section) => {
  if (Array.isArray(section?.lines)) {
    return section.lines;
  }

  if (!section?.lines) {
    return [];
  }

  return toFlatItems(section.lines);
};

const buildSectionOverview = ({
  section,
  sectionIndex,
  layouts,
  controls,
  menuSceneId,
}) => {
  const outgoingSceneIds = new Set();
  let hasMenuReturnAction = false;
  let returnsToMenuScene = false;

  for (const line of toSectionLines(section)) {
    const lineActions = normalizeLineActions(line?.actions || {});

    if (lineActions?.pushLayeredView || lineActions?.popLayeredView) {
      hasMenuReturnAction = true;
    }

    const directTransition = lineActions?.sectionTransition?.sceneId;
    if (isNonEmptyString(directTransition)) {
      outgoingSceneIds.add(directTransition);
      if (directTransition === menuSceneId) {
        returnsToMenuScene = true;
      }
    }

    const choiceItems = Array.isArray(lineActions?.choice?.items)
      ? lineActions.choice.items
      : [];
    for (const choiceItem of choiceItems) {
      const choiceTransition =
        choiceItem?.events?.click?.actions?.sectionTransition?.sceneId;
      if (!isNonEmptyString(choiceTransition)) {
        continue;
      }
      outgoingSceneIds.add(choiceTransition);
      if (choiceTransition === menuSceneId) {
        returnsToMenuScene = true;
      }
    }

    const layoutRefs = [lineActions?.background, lineActions?.control].filter(
      (ref) => ref?.resourceId,
    );
    for (const ref of layoutRefs) {
      const layout = resolveLayoutReference({
        ref,
        layouts,
        controls,
      });
      const layoutTransitions = getTransitionsFromLayout(layout, menuSceneId);
      layoutTransitions.sceneIds.forEach((sceneId) => {
        outgoingSceneIds.add(sceneId);
      });
      if (layoutTransitions.returnsToMenuScene) {
        returnsToMenuScene = true;
      }
    }
  }

  const normalizedOutgoingSceneIds = [...outgoingSceneIds];

  return {
    sectionId: section?.id,
    name: section?.name || `Section ${sectionIndex + 1}`,
    outgoingSceneIds: normalizedOutgoingSceneIds,
    isDeadEnd:
      normalizedOutgoingSceneIds.length === 0 &&
      !hasMenuReturnAction &&
      !returnsToMenuScene,
  };
};

export const buildSceneOverview = ({ repositoryState, sceneId }) => {
  if (!isNonEmptyString(sceneId)) {
    return undefined;
  }

  const scene = repositoryState?.scenes?.items?.[sceneId];
  if (!scene || scene.type === "folder") {
    return undefined;
  }

  const menuSceneId = repositoryState?.story?.initialSceneId || null;
  const layouts = repositoryState?.layouts || { items: {} };
  const controls = repositoryState?.controls || { items: {} };
  const sections = toFlatItems(
    scene?.sections || {
      items: {},
      tree: [],
    },
  )
    .filter((section) => section?.type !== "folder")
    .map((section, index) =>
      buildSectionOverview({
        section,
        sectionIndex: index,
        layouts,
        controls,
        menuSceneId,
      }),
    );

  return {
    sceneId,
    name: scene?.name || `Scene ${sceneId}`,
    position: structuredClone(scene?.position || { x: 0, y: 0 }),
    outgoingSceneIds: [
      ...new Set(sections.flatMap((section) => section.outgoingSceneIds)),
    ],
    sections,
  };
};
