import { toFlatItems } from "#v2-tree-helpers";

const createTransitionKey = (transition) => {
  if (!transition) {
    return null;
  }

  const sceneId = transition.sceneId || "";
  const sectionId = transition.sectionId || "";

  if (!sceneId && !sectionId) {
    return null;
  }

  return `${sceneId}::${sectionId}`;
};

const getTransitionsFromLayout = (layout) => {
  if (!layout?.elements?.items) {
    return [];
  }

  return Object.values(layout.elements.items)
    .map((element) => {
      return element?.click?.actionPayload?.actions?.sectionTransition;
    })
    .filter(Boolean);
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

export const getSectionPresentation = ({
  section,
  initialSectionId,
  layouts,
  menuSceneId,
}) => {
  const lines = toSectionLines(section);
  const transitions = new Set();

  let choiceCount = 0;
  let hasMenuReturnAction = false;
  let returnsToMenuScene = false;

  lines.forEach((line) => {
    const pushLayeredView =
      line.actions?.pushLayeredView || line.actions?.actions?.pushLayeredView;
    const popLayeredView =
      line.actions?.popLayeredView || line.actions?.actions?.popLayeredView;
    if (pushLayeredView || popLayeredView) {
      hasMenuReturnAction = true;
    }

    const sectionTransition =
      line.actions?.sectionTransition ||
      line.actions?.actions?.sectionTransition;
    if (menuSceneId && sectionTransition?.sceneId === menuSceneId) {
      returnsToMenuScene = true;
    }
    const sectionTransitionKey = createTransitionKey(sectionTransition);
    if (sectionTransitionKey) {
      transitions.add(sectionTransitionKey);
    }

    const choice = line.actions?.choice || line.actions?.actions?.choice;
    const choiceItems = Array.isArray(choice?.items) ? choice.items : [];
    choiceCount += choiceItems.length;

    choiceItems.forEach((choiceItem) => {
      const choiceTransition =
        choiceItem.events?.click?.actions?.sectionTransition;
      if (menuSceneId && choiceTransition?.sceneId === menuSceneId) {
        returnsToMenuScene = true;
      }
      const choiceTransitionKey = createTransitionKey(choiceTransition);
      if (choiceTransitionKey) {
        transitions.add(choiceTransitionKey);
      }
    });

    const layoutRefs = [
      line.actions?.background,
      line.actions?.base,
      line.actions?.actions?.background,
      line.actions?.actions?.base,
    ].filter((ref) => ref?.resourceType === "layout" && ref?.resourceId);

    layoutRefs.forEach((layoutRef) => {
      const layout = layouts?.items?.[layoutRef.resourceId];
      const layoutTransitions = getTransitionsFromLayout(layout);

      layoutTransitions.forEach((layoutTransition) => {
        if (menuSceneId && layoutTransition?.sceneId === menuSceneId) {
          returnsToMenuScene = true;
        }
        const layoutTransitionKey = createTransitionKey(layoutTransition);
        if (layoutTransitionKey) {
          transitions.add(layoutTransitionKey);
        }
      });
    });
  });

  const outgoingCount = transitions.size;
  const isMenuReturn = hasMenuReturnAction || returnsToMenuScene;

  return {
    lineCount: lines.length,
    choiceCount,
    outgoingCount,
    isMenuReturn,
    isDeadEnd: outgoingCount === 0 && !isMenuReturn,
    isInitial: section.id === initialSectionId,
  };
};
