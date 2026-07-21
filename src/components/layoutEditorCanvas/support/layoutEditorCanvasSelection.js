export const LAYOUT_EDITOR_SELECTION_METADATA_KEY = "__layoutEditorSelection";

const EDITOR_CHROME_ID_PREFIX = "selected-border";

const toElementList = (elements) => {
  if (Array.isArray(elements)) {
    return elements.filter(Boolean);
  }

  return elements ? [elements] : [];
};

const toUniqueItemIds = (itemIds = []) => {
  const seen = new Set();

  return itemIds.filter((itemId) => {
    if (!itemId || seen.has(itemId)) {
      return false;
    }

    seen.add(itemId);
    return true;
  });
};

export const createLayoutEditorSelectionElementMapper = ({ layoutId } = {}) => {
  return ({ element, ancestry = [] }) => {
    const authoredPath = toUniqueItemIds(
      ancestry
        .filter((entry) => entry.layoutId === layoutId)
        .map((entry) => entry.node?.id),
    );
    const ownerItemId = authoredPath.at(-1);

    if (!ownerItemId) {
      return element;
    }

    return {
      ...element,
      [LAYOUT_EDITOR_SELECTION_METADATA_KEY]: {
        ownerItemId,
        authoredPath,
      },
    };
  };
};

export const extractLayoutEditorSelectionOccurrences = (elements) => {
  const occurrencesById = {};
  const occurrenceIdsByOwner = {};

  const visit = (elementList) => {
    return toElementList(elementList).map((element) => {
      const nextElement = {
        ...element,
      };
      const metadata = nextElement[LAYOUT_EDITOR_SELECTION_METADATA_KEY];
      delete nextElement[LAYOUT_EDITOR_SELECTION_METADATA_KEY];

      if (metadata?.ownerItemId && nextElement.id) {
        const occurrence = {
          occurrenceId: nextElement.id,
          ownerItemId: metadata.ownerItemId,
          authoredPath: toUniqueItemIds(metadata.authoredPath),
        };
        occurrencesById[nextElement.id] = occurrence;

        const ownerOccurrences =
          occurrenceIdsByOwner[metadata.ownerItemId] ?? [];
        ownerOccurrences.push(nextElement.id);
        occurrenceIdsByOwner[metadata.ownerItemId] = ownerOccurrences;
      }

      if (Array.isArray(nextElement.children)) {
        nextElement.children = visit(nextElement.children);
      }

      return nextElement;
    });
  };

  return {
    elements: visit(elements),
    occurrencesById,
    occurrenceIdsByOwner,
  };
};

const isBlockingEditorChromeHit = (hit) => {
  const targetId = hit?.path?.at(-1)?.id;

  return (
    targetId === `${EDITOR_CHROME_ID_PREFIX}-anchor` ||
    targetId?.startsWith(`${EDITOR_CHROME_ID_PREFIX}-resize-`)
  );
};

const createAuthoredHitPath = ({ renderPath, occurrencesById }) => {
  let deepestOccurrence;

  for (let index = renderPath.length - 1; index >= 0; index -= 1) {
    const occurrence = occurrencesById[renderPath[index].id];
    if (occurrence) {
      deepestOccurrence = occurrence;
      break;
    }
  }

  if (!deepestOccurrence) {
    return [];
  }

  return deepestOccurrence.authoredPath.flatMap((itemId) => {
    const renderEntry = renderPath.find((entry) => {
      return occurrencesById[entry.id]?.ownerItemId === itemId;
    });

    if (!renderEntry) {
      return [];
    }

    return [
      {
        itemId,
        occurrenceId: renderEntry.id,
        bounds: renderEntry.bounds,
      },
    ];
  });
};

export const resolveLayoutEditorCanvasHitPath = ({
  hits = [],
  occurrencesById = {},
} = {}) => {
  if (isBlockingEditorChromeHit(hits[0])) {
    return {
      blocked: true,
      path: [],
    };
  }

  for (const hit of hits) {
    const path = createAuthoredHitPath({
      renderPath: hit.path ?? [],
      occurrencesById,
    });

    if (path.length > 0) {
      return {
        blocked: false,
        path,
      };
    }
  }

  return {
    blocked: false,
    path: [],
  };
};

export const selectLayoutEditorCanvasHit = (
  hitResolution,
  { deepSelect = false } = {},
) => {
  if (hitResolution?.blocked === true || hitResolution?.path?.length === 0) {
    return undefined;
  }

  return deepSelect ? hitResolution.path.at(-1) : hitResolution.path[0];
};

export const selectLayoutEditorCanvasHover = (
  hitResolution,
  { deepSelect = false, selectedOccurrenceId } = {},
) => {
  const selectedOccurrenceIsUnderPointer = hitResolution?.path?.some(
    ({ occurrenceId }) => occurrenceId === selectedOccurrenceId,
  );

  if (!deepSelect && selectedOccurrenceIsUnderPointer) {
    return undefined;
  }

  return selectLayoutEditorCanvasHit(hitResolution, { deepSelect });
};

export const selectNextLayoutEditorCanvasHit = (
  hitResolution,
  { selectedItemId } = {},
) => {
  if (hitResolution?.blocked === true || hitResolution?.path?.length === 0) {
    return undefined;
  }

  const selectedIndex = hitResolution.path.findIndex(
    ({ itemId }) => itemId === selectedItemId,
  );

  if (selectedIndex < 0) {
    return hitResolution.path[1] ?? hitResolution.path[0];
  }

  return (
    hitResolution.path[selectedIndex + 1] ?? hitResolution.path[selectedIndex]
  );
};
