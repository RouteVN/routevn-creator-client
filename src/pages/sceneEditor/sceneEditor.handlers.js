import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";
import { extractFileIdsFromRenderState } from "../../utils/index.js";
import { filter, tap, debounceTime } from "rxjs";

// Helper function to create assets object from fileIds
async function createAssetsFromFileIds(
  fileIds,
  getFileContent,
  { audios, images, fonts = {} },
) {
  const assets = {};
  for (const fileId of fileIds) {
    try {
      const { url } = await getFileContent({
        fileId,
        projectId: "someprojectId",
      });
      let type;

      Object.entries(audios)
        .concat(Object.entries(images))
        .concat(Object.entries(fonts))
        .forEach(([key, item]) => {
          if (item.fileId === fileId) {
            type = item.fileType;
          }
        });

      assets[`file:${fileId}`] = {
        url,
        type,
      };
    } catch (error) {
      console.error(`Failed to load file ${fileId}:`, error);
    }
  }

  return assets;
}

// Helper function to render the scene state
async function renderSceneState(store, drenderer, getFileContent) {
  const renderState = store.selectRenderState();
  const fileIds = extractFileIdsFromRenderState(renderState);
  const assets = await createAssetsFromFileIds(fileIds, getFileContent, {
    audios: store.selectAudios(),
    images: store.selectImages(),
    fonts: store.selectFonts(),
  });
  await drenderer.loadAssets(assets);
  drenderer.render(renderState);
}

export const handleBeforeMount = (deps) => {
  const { store, router, repository } = deps;
  const { sceneId } = router.getPayload();

  store.setSceneId(sceneId);
  store.setRepositoryState(repository.getState());

  // Get scene to set first section
  const scene = store.selectScene();
  if (scene && scene.sections && scene.sections.length > 0) {
    store.setSelectedSectionId(scene.sections[0].id);
  }
};

export const handleAfterMount = async (deps) => {
  const { getRefIds, drenderer } = deps;
  // Initialize drenderer with canvas
  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });
};

export const handleSectionTabClick = (e, deps) => {
  const { store, render, drenderer, getFileContent } = deps;
  const id = e.currentTarget.id.replace("section-tab-", "");
  store.setSelectedSectionId(id);

  // Reset selected line to first line of new section
  const scene = store.selectScene();
  const newSection = scene.sections.find((section) => section.id === id);
  if (newSection && newSection.lines && newSection.lines.length > 0) {
    store.setSelectedLineId(newSection.lines[0].id);
  } else {
    store.setSelectedLineId(undefined);
  }

  render();

  // Render the canvas with the latest data
  setTimeout(async () => {
    await renderSceneState(store, drenderer, getFileContent);
  }, 10);
};

export const handleCommandLineSubmit = (e, deps) => {
  const { store, render, repository, drenderer, getFileContent } = deps;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();

  // Handle scene transitions specially - they don't require a lineId
  if (e.detail.sceneTransition) {
    if (!lineId) {
      console.warn("Scene transition requires a selected line");
      return;
    }

    repository.addAction({
      actionType: "set",
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.presentation`,
      value: {
        replace: false,
        item: e.detail,
      },
    });

    store.setRepositoryState(repository.getState());
    store.setMode("lines-editor");
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneState(store, drenderer, getFileContent);
    }, 10);
    return;
  }

  // Handle section transitions
  if (e.detail.sectionTransition) {
    if (!lineId) {
      console.warn("Section transition requires a selected line");
      return;
    }

    repository.addAction({
      actionType: "set",
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.presentation`,
      value: {
        replace: false,
        item: e.detail,
      },
    });

    store.setRepositoryState(repository.getState());
    store.setMode("lines-editor");
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneState(store, drenderer, getFileContent);
    }, 10);
    return;
  }

  if (!lineId) {
    return;
  }

  let submissionData = e.detail;

  // If this is a dialogue submission, preserve the existing content
  if (submissionData.dialogue) {
    const { scenes } = repository.getState();
    const scene = toFlatItems(scenes)
      .filter((item) => item.type === "scene")
      .find((item) => item.id === sceneId);

    if (scene) {
      const section = toFlatItems(scene.sections).find(
        (s) => s.id === sectionId,
      );
      if (section) {
        const line = toFlatItems(section.lines).find((l) => l.id === lineId);
        if (line && line.presentation?.dialogue?.content) {
          // Preserve existing text
          submissionData = {
            ...submissionData,
            dialogue: {
              ...submissionData.dialogue,
              content: line.presentation.dialogue.content,
            },
          };
        }
      }
    }
  }

  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.presentation`,
    value: {
      replace: false,
      item: submissionData,
    },
  });

  store.setRepositoryState(repository.getState());
  store.setMode("lines-editor");

  render();

  // Render the canvas with the latest data
  setTimeout(async () => {
    await renderSceneState(store, drenderer, getFileContent);
  }, 10);
};

export const handleEditorDataChanged = async (e, deps) => {
  const { subject, store, drenderer, getFileContent } = deps;

  // Update local store immediately for UI responsiveness
  store.setLineTextContent({
    lineId: e.detail.lineId,
    content: e.detail.content,
  });

  // Dispatch to subject for throttled/debounced repository update
  subject.dispatch("updateDialogueContent", {
    lineId: e.detail.lineId,
    content: e.detail.content,
  });

  // Render the scene immediately with the updated content
  setTimeout(async () => {
    await renderSceneState(store, drenderer, getFileContent);
  }, 10);
};

export const handleAddPresentationButtonClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleSectionAddClick = (e, deps) => {
  const { store, repository, render } = deps;

  const sceneId = store.selectSceneId();
  const newSectionId = nanoid();
  const newLineId = nanoid();

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections`,
    value: {
      parent: "_root",
      position: "last",
      item: {
        id: newSectionId,
        name: "Section New",
        lines: {
          items: {
            presentation: {},
          },
          tree: [
            {
              id: newLineId,
            },
          ],
        },
      },
    },
  });

  // Update store with new repository state
  store.setRepositoryState(repository.getState());

  store.setSelectedSectionId(newSectionId);
  render();
};

export const handleSplitLine = (e, deps) => {
  const { repository, store, render, getRefIds, drenderer, getFileContent } =
    deps;

  const sceneId = store.selectSceneId();
  const newLineId = nanoid();
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent } = e.detail;

  console.log("[handleSplitLine] Splitting line:", {
    lineId,
    leftContent,
    rightContent,
    leftLength: leftContent.length,
    rightLength: rightContent.length,
  });

  // Get existing presentation data to preserve everything except dialogue content
  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);

  let existingPresentation = {};
  let existingDialogue = {};
  if (scene) {
    const section = toFlatItems(scene.sections).find((s) => s.id === sectionId);
    if (section) {
      const line = toFlatItems(section.lines).find((l) => l.id === lineId);
      if (line && line.presentation) {
        // Preserve ALL presentation data
        existingPresentation = JSON.parse(JSON.stringify(line.presentation));
        if (line.presentation.dialogue) {
          existingDialogue = line.presentation.dialogue;
        }
      }
    }
  }

  // First, update the current line with the left content
  // Only update the dialogue.content, preserve everything else
  if (existingDialogue && Object.keys(existingDialogue).length > 0) {
    // If dialogue exists, update only the content
    repository.addAction({
      actionType: "set",
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.presentation.dialogue.content`,
      value: leftContent,
    });
  } else if (leftContent) {
    // If no dialogue exists but we have content, create minimal dialogue
    repository.addAction({
      actionType: "set",
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.presentation.dialogue`,
      value: {
        content: leftContent,
      },
    });
  }

  // Then, create a new line with the right content and insert it after the current line
  // New line should have empty presentation except for dialogue.content
  const newLinePresentation = rightContent
    ? {
      dialogue: {
        content: rightContent,
      },
    }
    : {};

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
    value: {
      parent: "_root",
      position: { after: lineId },
      item: {
        id: newLineId,
        presentation: newLinePresentation,
      },
    },
  });

  // Update store with new repository state IMMEDIATELY for UI responsiveness
  store.setRepositoryState(repository.getState());

  // Handle UI updates immediately for responsiveness
  // Pre-configure the linesEditor before rendering
  const refIds = getRefIds();
  const linesEditorRef = refIds["lines-editor"];

  if (linesEditorRef) {
    // Set cursor position to 0 (beginning of new line)
    linesEditorRef.elm.store.setCursorPosition(0);
    linesEditorRef.elm.store.setGoalColumn(0);
    linesEditorRef.elm.store.setNavigationDirection("down");
    linesEditorRef.elm.store.setIsNavigating(true);
  }

  // Update selectedLineId through the store (not directly in linesEditor)
  store.setSelectedLineId(newLineId);

  // Render after setting the selected line ID
  render();

  // Use requestAnimationFrame for focus operations
  requestAnimationFrame(() => {
    if (linesEditorRef) {
      linesEditorRef.elm.transformedHandlers.updateSelectedLine(newLineId);

      // Also render the linesEditor
      linesEditorRef.elm.render();
    }
  });

  // Render the canvas with the latest data
  setTimeout(async () => {
    await renderSceneState(store, drenderer, getFileContent);
  }, 10);
};

export const handleNewLine = (e, deps) => {
  const { store, render, repository } = deps;

  const sceneId = store.selectSceneId();
  const newLineId = nanoid();
  const sectionId = store.selectSelectedSectionId();

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
    value: {
      parent: "_root",
      position: "last",
      item: {
        id: newLineId,
        presentation: {},
      },
    },
  });

  render();
};

export const handleMoveUp = (e, deps) => {
  const { store, getRefIds, render, drenderer, getFileContent } = deps;
  const currentLineId = e.detail.lineId;
  const previousLineId = store.selectPreviousLineId({ lineId: currentLineId });

  // Only move if we have a different previous line
  if (previousLineId && previousLineId !== currentLineId) {
    const refIds = getRefIds();
    const linesEditorRef = refIds["lines-editor"];

    // Update selectedLineId through the store
    store.setSelectedLineId(previousLineId);

    // Pass cursor position from event detail
    if (e.detail.cursorPosition !== undefined) {
      if (e.detail.cursorPosition === -1) {
        // Special value: position at end of target line (for ArrowLeft navigation)
        const targetLineRef = refIds[`line-${previousLineId}`];
        const targetTextLength = targetLineRef?.elm?.textContent?.length || 0;
        linesEditorRef.elm.store.setCursorPosition(targetTextLength);
        linesEditorRef.elm.store.setGoalColumn(targetTextLength);
        linesEditorRef.elm.store.setNavigationDirection("end"); // Special direction for end positioning
      } else {
        linesEditorRef.elm.store.setCursorPosition(e.detail.cursorPosition);
        // Set direction flag in store before calling updateSelectedLine
        linesEditorRef.elm.store.setNavigationDirection("up");
      }
    } else {
      // Set direction flag in store before calling updateSelectedLine
      linesEditorRef.elm.store.setNavigationDirection("up");
    }
    linesEditorRef.elm.transformedHandlers.updateSelectedLine(previousLineId);

    // Force a render to update line colors after navigation
    setTimeout(() => {
      render();
      // Also render the linesEditor to update line colors
      linesEditorRef.elm.render();

      setTimeout(async () => {
        await renderSceneState(store, drenderer, getFileContent);
      }, 10);
    }, 0);
  }
};

export const handleBackToActions = (e, deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleMoveDown = (e, deps) => {
  const { store, getRefIds, render, drenderer, getFileContent } = deps;
  const currentLineId = e.detail.lineId;
  const nextLineId = store.selectNextLineId({ lineId: currentLineId });

  // Only move if we have a different next line
  if (nextLineId && nextLineId !== currentLineId) {
    const refIds = getRefIds();
    const linesEditorRef = refIds["lines-editor"];

    // Update selectedLineId through the store
    store.setSelectedLineId(nextLineId);

    // Pass cursor position from event detail
    if (e.detail.cursorPosition !== undefined) {
      linesEditorRef.elm.store.setCursorPosition(e.detail.cursorPosition);
      if (e.detail.cursorPosition === 0) {
        // When moving to beginning, set goal column to 0 as well
        linesEditorRef.elm.store.setGoalColumn(0);
      }
    }

    // Set direction flag in store before calling updateSelectedLine
    linesEditorRef.elm.store.setNavigationDirection("down");
    linesEditorRef.elm.transformedHandlers.updateSelectedLine(nextLineId);

    // Force a render to update line colors after navigation
    setTimeout(() => {
      render();
      // Also render the linesEditor to update line colors
      linesEditorRef.elm.render();

      setTimeout(async () => {
        await renderSceneState(store, drenderer, getFileContent);
      }, 10);
    }, 0);
  }
};

export const handleMergeLines = (e, deps) => {
  const { store, getRefIds, render, repository, drenderer, getFileContent } =
    deps;
  const { prevLineId, currentLineId, contentToAppend } = e.detail;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  // Get previous line content and existing dialogue properties
  const scene = store.selectScene();
  const section = scene.sections.find((s) => s.id === sectionId);
  const prevLine = section.lines.find((s) => s.id === prevLineId);

  if (!prevLine) return;

  const prevContent = prevLine.presentation?.dialogue?.content || "";
  const mergedContent = prevContent + contentToAppend;

  // Store the length of the previous content for cursor positioning
  const prevContentLength = prevContent.length;

  // Get existing dialogue data to preserve layoutId and characterId
  let existingDialogue = {};
  if (prevLine.presentation?.dialogue) {
    existingDialogue = prevLine.presentation.dialogue;
  }

  // Update previous line with merged content
  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${prevLineId}.presentation`,
    value: {
      replace: false,
      item: {
        dialogue: {
          ...existingDialogue,
          content: mergedContent,
        },
      },
    },
  });

  // Delete current line
  repository.addAction({
    actionType: "treeDelete",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
    value: {
      id: currentLineId,
    },
  });

  // Update the scene data

  // Update selected line to the previous one
  store.setSelectedLineId(prevLineId);

  // Pre-configure the linesEditor for cursor positioning
  const refIds = getRefIds();
  const linesEditorRef = refIds["lines-editor"];

  if (linesEditorRef) {
    // Set cursor position to where the previous content ended
    linesEditorRef.elm.store.setCursorPosition(prevContentLength);
    linesEditorRef.elm.store.setGoalColumn(prevContentLength);
    linesEditorRef.elm.store.setIsNavigating(true);
  }

  // Render and then focus
  render();

  requestAnimationFrame(() => {
    if (linesEditorRef) {
      linesEditorRef.elm.transformedHandlers.updateSelectedLine(prevLineId);
      linesEditorRef.elm.render();
    }
  });

  // Render the canvas with the latest data
  setTimeout(async () => {
    await renderSceneState(store, drenderer, getFileContent);
  }, 10);
};

export const handleOpenCommandLine = (e, deps) => {
  const { store, render } = deps;
  const mode = e.currentTarget.getAttribute("data-mode");
  store.setMode(mode);
  render();
};

export const handlePresentationActionRightClick = (e, deps) => {
  const { store, render } = deps;
  const mode = e.currentTarget.getAttribute("data-mode");
  e.preventDefault();
  store.showPresentationDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    presentationType: mode,
  });
  render();
};

export const handleActionClicked = (e, deps) => {
  const { store, render } = deps;
  store.setMode(e.detail.item.mode);
  render();
};

export const handleSectionTabRightClick = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault(); // Prevent default browser context menu

  const sectionId = e.currentTarget.id.replace("section-tab-", "");

  store.showSectionDropdownMenu({
    position: {
      x: e.clientX,
      y: e.clientY,
    },
    sectionId,
  });

  render();
};

export const handleActionsDialogClose = (e, deps) => {
  const { store, render } = deps;
  store.setMode("lines-editor");
  render();
};

export const handleDropdownMenuClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = (e, deps) => {
  const { store, render, repository } = deps;
  const action = e.detail.item.value; // Access value from item object
  const dropdownState = store.getState().dropdownMenu;
  const sectionId = dropdownState.sectionId;
  const presentationType = dropdownState.presentationType;
  const sceneId = store.selectSceneId();

  // Store position before hiding dropdown (for rename popover)
  const position = dropdownState.position;

  store.hideDropdownMenu();

  if (action === "delete-section") {
    // Delete section from repository
    const scene = store.selectScene();
    repository.addAction({
      actionType: "treeDelete",
      target: `scenes.items.${sceneId}.sections`,
      value: {
        id: sectionId,
      },
    });

    // Update store with new repository state
    store.setRepositoryState(repository.getState());

    // Update scene data and select first remaining section
    const newScene = store.selectScene();
    if (newScene && newScene.sections.length > 0) {
      store.setSelectedSectionId(newScene.sections[0].id);
    }
  } else if (action === "rename-section") {
    // Show rename popover using the stored position
    store.showPopover({
      position,
      sectionId,
    });
  } else if (action === "delete-presentation") {
    const selectedLineId = store.selectSelectedLineId();
    const selectedSectionId = store.selectSelectedSectionId();

    if (presentationType && selectedLineId && selectedSectionId) {
      repository.addAction({
        actionType: "unset",
        target: `scenes.items.${sceneId}.sections.items.${selectedSectionId}.lines.items.${selectedLineId}.presentation.${presentationType}`,
      });
      store.setRepositoryState(repository.getState());
    }
  }

  render();
};

export const handlePopoverClickOverlay = (e, deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleLineSelectionChanged = (e, deps) => {
  const { store, render, drenderer, getFileContent } = deps;
  const { lineId } = e.detail;

  store.setSelectedLineId(lineId);
  render();

  // Render the canvas with the latest data
  setTimeout(async () => {
    await renderSceneState(store, drenderer, getFileContent);
  }, 10);
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, repository } = deps;
  const detail = e.detail;

  // Extract action and values from detail
  const action = detail.action || detail.actionId;
  const values = detail.values || detail.formValues || detail;

  if (action === "cancel") {
    store.hidePopover();
    render();
    return;
  }

  if (action === "submit") {
    // Get the popover section ID from state
    const sectionId = store.getState().popover.sectionId;
    const sceneId = store.selectSceneId();

    // Hide popover
    store.hidePopover();

    // Update section name in repository
    if (sectionId && values.name && sceneId) {
      repository.addAction({
        actionType: "treeUpdate",
        target: `scenes.items.${sceneId}.sections`,
        value: {
          id: sectionId,
          replace: false,
          item: {
            name: values.name,
          },
        },
      });

      // Update store with new repository state
      store.setRepositoryState(repository.getState());
    }

    render();
  }
};

export const handleToggleSectionsGraphView = (e, deps) => {
  const { store, render } = deps;
  store.toggleSectionsGraphView();
  render();
};

// Handler for throttled/debounced dialogue content updates
export const handleUpdateDialogueContent = (payload, deps) => {
  const { repository, store, drenderer, getFileContent } = deps;
  const { lineId, content } = payload;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  // Get existing dialogue data to preserve layoutId and characterId
  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);

  let existingDialogue = {};
  if (scene) {
    const section = toFlatItems(scene.sections).find((s) => s.id === sectionId);
    if (section) {
      const line = toFlatItems(section.lines).find((l) => l.id === lineId);
      if (line && line.presentation?.dialogue) {
        existingDialogue = line.presentation.dialogue;
      }
    }
  }

  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.presentation`,
    value: {
      replace: false,
      item: {
        dialogue: {
          ...existingDialogue,
          content: content,
        },
      },
    },
  });

  // Note: store.setLineTextContent is already called immediately in handleEditorDataChanged
  // so we don't need to call it again here

  setTimeout(async () => {
    await renderSceneState(store, drenderer, getFileContent);
  }, 10);
};

// RxJS subscriptions for handling events with throttling/debouncing
export const subscriptions = (deps) => {
  const { subject } = deps;

  return [
    // Debounce dialogue content updates by 2000ms (2 seconds)
    subject.pipe(
      filter(({ action }) => action === "updateDialogueContent"),
      debounceTime(2000),
      tap(({ payload }) => {
        deps.handlers.handleUpdateDialogueContent(payload, deps);
      }),
    ),
  ];
};
