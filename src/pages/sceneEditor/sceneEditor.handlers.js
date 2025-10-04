import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";
import { extractFileIdsFromRenderState } from "../../utils/index.js";
import { filter, tap, debounceTime } from "rxjs";
import { constructProjectData } from "../../utils/projectDataConstructor.js";

// Helper function to create assets object from fileIds
async function createAssetsFromFileIds(
  fileIds,
  fileManager,
  { audios, images, fonts = {} },
) {
  const assets = {};
  for (const fileId of fileIds) {
    try {
      const { url } = await fileManager.getFileContent({
        fileId,
      });
      let type;

      Object.entries(audios)
        .concat(Object.entries(images))
        .concat(Object.entries(fonts))
        .forEach(([_key, item]) => {
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
async function renderSceneState(store, drenderer, fileManager) {
  const renderState = store.selectRenderState();
  const fileIds = extractFileIdsFromRenderState(renderState);
  const repositoryState = store.selectRepositoryState();
  const projectData = constructProjectData(repositoryState);
  const assets = await createAssetsFromFileIds(fileIds, fileManager, {
    audios: projectData.resources.audio,
    images: projectData.resources.images,
    fonts: projectData.resources.fonts,
  });
  await drenderer.loadAssets(assets);
  drenderer.render(renderState);
}

export const handleBeforeMount = (deps) => {
  const { drenderer } = deps;

  return () => {
    drenderer.destroy();
  };
};

export const handleAfterMount = async (deps) => {
  const {
    getRefIds,
    drenderer,
    store,
    fileManagerFactory,
    router,
    repositoryFactory,
    render,
  } = deps;

  // Get sceneId and projectId from router
  const { sceneId, p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  store.setSceneId(sceneId);
  store.setRepositoryState(repository.getState());

  // Get scene to set first section and first line
  const scene = store.selectScene();
  if (scene && scene.sections && scene.sections.length > 0) {
    const firstSection = scene.sections[0];
    store.setSelectedSectionId(firstSection.id);

    // Also select the first line in the first section
    if (firstSection.lines && firstSection.lines.length > 0) {
      store.setSelectedLineId(firstSection.lines[0].id);
    }
  }

  // Initialize drenderer with canvas
  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });

  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(p);
  // Render the canvas with the initial selected line's actions data
  await renderSceneState(store, drenderer, fileManager);

  render();
};

export const handleSectionTabClick = (deps, payload) => {
  const { store, render, subject } = deps;
  const id = payload._event.currentTarget.id.replace("section-tab-", "");
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

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleCommandLineSubmit = async (deps, payload) => {
  const {
    store,
    render,
    repositoryFactory,
    router,
    subject,
    drenderer,
    fileManagerFactory,
  } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();

  // Handle section/scene transitions
  if (payload._event.detail.sectionTransition) {
    if (!lineId) {
      console.warn("Section transition requires a selected line");
      return;
    }

    repository.addAction({
      actionType: "set",
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions`,
      value: {
        replace: false,
        item: payload._event.detail,
      },
    });

    store.setRepositoryState(repository.getState());
    store.setMode("lines-editor");
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      // Get fileManager for this project
      const fileManager = await fileManagerFactory.getByProject(p);
      await renderSceneState(store, drenderer, fileManager);
    }, 10);
    return;
  }

  if (!lineId) {
    return;
  }

  let submissionData = payload._event.detail;

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
        if (line && line.actions?.dialogue?.content) {
          // Preserve existing text
          submissionData = {
            ...submissionData,
            dialogue: {
              ...submissionData.dialogue,
              content: line.actions.dialogue.content,
            },
          };
        }
      }
    }
  }

  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions`,
    value: {
      replace: false,
      item: submissionData,
    },
  });

  store.setRepositoryState(repository.getState());
  store.setMode("lines-editor");

  render();

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleEditorDataChanged = async (deps, payload) => {
  const { subject, store } = deps;

  const content = [
    {
      text: payload._event.detail.content,
    },
  ];
  // Update local store immediately for UI responsiveness
  store.setLineTextContent({
    lineId: payload._event.detail.lineId,
    content,
  });

  // Dispatch to subject for throttled/debounced repository update
  subject.dispatch("updateDialogueContent", {
    lineId: payload._event.detail.lineId,
    content,
  });

  // Render the scene immediately with the updated content
  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleAddActionsButtonClick = (deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleSectionAddClick = async (deps) => {
  const {
    store,
    repositoryFactory,
    router,
    render,
    drenderer,
    fileManagerFactory,
  } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const sceneId = store.selectSceneId();
  const newSectionId = nanoid();
  const newLineId = nanoid();

  // Get current scene to count sections
  const scene = store.selectScene();
  const sectionCount = scene?.sections?.length || 0;
  const newSectionName = `Section ${sectionCount + 1}`;

  // Get layouts from repository to find first dialogue layout
  const { layouts } = repository.getState();
  let dialogueLayoutId = null;

  if (layouts && layouts.items) {
    // Find first layout with layoutType: "dialogue"
    for (const [layoutId, layout] of Object.entries(layouts.items)) {
      if (layout.layoutType === "dialogue") {
        dialogueLayoutId = layoutId;
        break;
      }
    }
  }

  // Create actions object with dialogue layout if found
  const actions = dialogueLayoutId
    ? {
        dialogue: {
          layoutId: dialogueLayoutId,
          mode: "adv",
          content: [{ text: "" }],
        },
      }
    : {
        dialogue: {
          mode: "adv",
          content: [{ text: "" }],
        },
      };

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections`,
    value: {
      parent: "_root",
      position: "last",
      item: {
        id: newSectionId,
        name: newSectionName,
        lines: {
          items: {
            [newLineId]: {
              actions: actions,
            },
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
  store.setSelectedLineId(newLineId);
  render();

  // Render the canvas with the new section's data
  setTimeout(async () => {
    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(p);
    await renderSceneState(store, drenderer, fileManager);
  }, 10);
};

export const handleSplitLine = async (deps, payload) => {
  const { repositoryFactory, router, store, render, getRefIds, subject } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const sceneId = store.selectSceneId();
  const newLineId = nanoid();
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent } = payload._event.detail;

  // First, persist any temporary line changes from the store to the repository
  // This ensures edits to other lines aren't lost when we update the repository
  const storeState = store.selectRepositoryState();
  const storeScene = toFlatItems(storeState.scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);

  if (storeScene) {
    toFlatItems(storeScene.sections).forEach((section) => {
      toFlatItems(section.lines).forEach((line) => {
        // Skip the line being split
        if (
          line.id !== lineId &&
          line.actions?.dialogue?.content !== undefined
        ) {
          // Persist this line's content to the repository
          repository.addAction({
            actionType: "set",
            target: `scenes.items.${sceneId}.sections.items.${section.id}.lines.items.${line.id}.actions.dialogue.content`,
            value: line.actions.dialogue.content,
          });
        }
      });
    });
  }

  // Get existing actions data to preserve everything except dialogue content
  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);

  let existingDialogue = {};
  if (scene) {
    const section = toFlatItems(scene.sections).find((s) => s.id === sectionId);
    if (section) {
      const line = toFlatItems(section.lines).find((l) => l.id === lineId);
      if (line && line.actions) {
        if (line.actions.dialogue) {
          existingDialogue = line.actions.dialogue;
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
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions.dialogue.content`,
      value: leftContent,
    });
  } else if (leftContent) {
    // If no dialogue exists but we have content, create minimal dialogue
    repository.addAction({
      actionType: "set",
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions.dialogue`,
      value: {
        content: leftContent,
      },
    });
  }

  // Then, create a new line with the right content and insert it after the current line
  // New line should have empty actions except for dialogue.content
  const newLineActions = rightContent
    ? {
        dialogue: {
          content: rightContent,
          mode: "adv",
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
        actions: newLineActions,
      },
    },
  });

  // Update store with new repository state (pending updates were already flushed)
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

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleNewLine = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

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
        actions: {},
      },
    },
  });

  render();
};

export const handleLineNavigation = (deps, payload) => {
  const { store, getRefIds, render, subject, drenderer } = deps;
  const { targetLineId, mode, direction, targetCursorPosition, lineRect } =
    payload._event.detail;

  // For block mode, just update the selection and handle scrolling
  if (mode === "block") {
    const currentLineId = store.selectSelectedLineId();

    console.log({
      currentLineId,
      targetLineId,
      direction,
    });

    // Check if we're trying to move up from the first line
    if (direction === "up" && currentLineId === targetLineId) {
      // First line - show animation effects
      drenderer.render({
        elements: [],
        transitions: [],
      });
      subject.dispatch("sceneEditor.renderCanvas", {});
      return;
    }

    store.setSelectedLineId(targetLineId);
    render();

    // Check if we need to scroll the line into view using provided coordinates
    if (lineRect) {
      requestAnimationFrame(() => {
        const refIds = getRefIds();
        const linesEditorRef = refIds["lines-editor"];

        if (linesEditorRef && linesEditorRef.elm) {
          const linesEditorElm = linesEditorRef.elm;

          // The scroll container is actually the parent of the lines-editor component
          // It's the rtgl-view with 'sv' (scroll vertical) attribute
          const scrollContainer = linesEditorElm.parentElement;

          const containerRect = scrollContainer?.getBoundingClientRect() || {};

          // Check if the line is fully visible in the viewport using provided coordinates
          const isAboveViewport = lineRect.top < containerRect.top;
          const isBelowViewport = lineRect.bottom > containerRect.bottom;

          // Only scroll if the line is not fully visible
          if (isAboveViewport || isBelowViewport) {
            // Query for the line element to scroll it
            // The line elements are inside the lines-editor component
            let lineElement = null;

            // First try shadow DOM
            if (linesEditorElm.shadowRoot) {
              lineElement = linesEditorElm.shadowRoot.querySelector(
                `#line-${targetLineId}`,
              );
            }

            // If not found, try regular DOM inside the component
            if (!lineElement) {
              lineElement = linesEditorElm.querySelector(
                `#line-${targetLineId}`,
              );
            }

            // Last resort: search in the whole document
            if (!lineElement) {
              lineElement = document.querySelector(`#line-${targetLineId}`);
            }

            if (lineElement) {
              lineElement.scrollIntoView({
                behavior: "auto", // Immediate scroll, no animation
                block: "nearest",
                inline: "nearest",
              });
            }
          }
        }
      });
    }

    // Trigger debounced canvas render
    subject.dispatch("sceneEditor.renderCanvas", {});
    return;
  }

  // For text-editor mode, handle cursor navigation
  const currentLineId = store.selectSelectedLineId();
  let nextLineId = targetLineId;

  // Determine next line based on direction if targetLineId is current line
  if (targetLineId === currentLineId) {
    if (direction === "up") {
      nextLineId = store.selectPreviousLineId({ lineId: currentLineId });
    } else if (direction === "down") {
      nextLineId = store.selectNextLineId({ lineId: currentLineId });
    }
  }

  // Handle navigation to different line
  if (nextLineId && nextLineId !== currentLineId) {
    const refIds = getRefIds();
    const linesEditorRef = refIds["lines-editor"];

    // Update selectedLineId through the store
    store.setSelectedLineId(nextLineId);

    // Handle cursor positioning based on direction
    if (linesEditorRef) {
      if (targetCursorPosition !== undefined) {
        if (targetCursorPosition === -1) {
          // Special value: position at end of target line (for ArrowLeft navigation)
          const targetLineRef = refIds[`line-${nextLineId}`];
          const targetTextLength = targetLineRef?.elm?.textContent?.length || 0;
          linesEditorRef.elm.store.setCursorPosition(targetTextLength);
          linesEditorRef.elm.store.setGoalColumn(targetTextLength);
          linesEditorRef.elm.store.setNavigationDirection("end"); // Special direction for end positioning
        } else {
          linesEditorRef.elm.store.setCursorPosition(targetCursorPosition);
          if (targetCursorPosition === 0) {
            // When moving to beginning, set goal column to 0 as well
            linesEditorRef.elm.store.setGoalColumn(0);
          }
        }
      }

      // Set direction flag in store before calling updateSelectedLine
      if (direction) {
        linesEditorRef.elm.store.setNavigationDirection(direction);
      }

      linesEditorRef.elm.transformedHandlers.updateSelectedLine(nextLineId);
    }

    // Force a render to update line colors after navigation
    setTimeout(() => {
      render();
      // Also render the linesEditor to update line colors
      if (linesEditorRef) {
        linesEditorRef.elm.render();
      }

      // Trigger debounced canvas render
      subject.dispatch("sceneEditor.renderCanvas", {});
    }, 0);
  } else if (direction === "up" && currentLineId === targetLineId) {
    // First line - show animation effects
    drenderer.render({
      elements: [],
      transitions: [],
    });
    subject.dispatch("sceneEditor.renderCanvas", {});
  }
};

export const handleBackToActions = (deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleMergeLines = async (deps, payload) => {
  const { store, getRefIds, render, repositoryFactory, router, subject } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { prevLineId, currentLineId, contentToAppend } = payload._event.detail;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  // Get previous line content and existing dialogue properties
  const scene = store.selectScene();
  const section = scene.sections.find((s) => s.id === sectionId);
  const prevLine = section.lines.find((s) => s.id === prevLineId);

  if (!prevLine) return;

  const prevContent = prevLine.actions?.dialogue?.content || "";
  const mergedContent = prevContent + contentToAppend;

  // Store the length of the previous content for cursor positioning
  const prevContentLength = prevContent.length;

  // Get existing dialogue data to preserve layoutId and characterId
  let existingDialogue = {};
  if (prevLine.actions?.dialogue) {
    existingDialogue = prevLine.actions.dialogue;
  }

  // Update previous line with merged content
  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${prevLineId}.actions`,
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

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleOpenCommandLine = (deps, payload) => {
  const { store, render } = deps;
  const mode = payload._event.currentTarget.getAttribute("data-mode");
  store.setMode(mode);
  render();
};

export const handleActionsActionRightClick = (deps, payload) => {
  const { store, render } = deps;
  const mode = payload._event.currentTarget.getAttribute("data-mode");
  payload._event.preventDefault();
  store.showActionsDropdownMenu({
    position: { x: payload._event.clientX, y: payload._event.clientY },
    actionsType: mode,
  });
  render();
};

export const handleActionClicked = (deps, payload) => {
  const { store, render } = deps;
  store.setMode(payload._event.detail.item.mode);
  render();
};

export const handleSectionTabRightClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault(); // Prevent default browser context menu

  const sectionId = payload._event.currentTarget.id.replace("section-tab-", "");

  store.showSectionDropdownMenu({
    position: {
      x: payload._event.clientX,
      y: payload._event.clientY,
    },
    sectionId,
  });

  render();
};

export const handleActionsDialogClose = (deps) => {
  const { store, render } = deps;
  store.setMode("lines-editor");
  render();
};

export const handleDropdownMenuClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hideDropdownMenu();
  render();
};

export const handleDropdownMenuClickItem = async (deps, payload) => {
  const { store, render, repositoryFactory, router, subject } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const action = payload._event.detail.item.value; // Access value from item object
  const dropdownState = store.getState().dropdownMenu;
  const sectionId = dropdownState.sectionId;
  const actionsType = dropdownState.actionsType;
  const sceneId = store.selectSceneId();

  // Store position before hiding dropdown (for rename popover)
  const position = dropdownState.position;

  store.hideDropdownMenu();

  if (action === "delete-section") {
    // Delete section from repository
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
  } else if (action === "delete-actions") {
    const selectedLineId = store.selectSelectedLineId();
    const selectedSectionId = store.selectSelectedSectionId();

    if (actionsType && selectedLineId && selectedSectionId) {
      // Special handling for dialogue - keep content, remove only layoutId and characterId
      if (actionsType === "dialogue") {
        const stateBefore = repository.getState();
        const currentActions =
          stateBefore.scenes?.items?.[sceneId]?.sections?.items?.[
            selectedSectionId
          ]?.lines?.items?.[selectedLineId]?.actions;

        if (currentActions?.dialogue) {
          // Keep content if it exists, remove layoutId and characterId
          const updatedDialogue = {
            content: currentActions.dialogue.content,
          };

          repository.addAction({
            actionType: "set",
            target: `scenes.items.${sceneId}.sections.items.${selectedSectionId}.lines.items.${selectedLineId}.actions.dialogue`,
            value: updatedDialogue,
          });
        }
      } else {
        // For all other actions types, use unset to remove completely
        repository.addAction({
          actionType: "unset",
          target: `scenes.items.${sceneId}.sections.items.${selectedSectionId}.lines.items.${selectedLineId}.actions.${actionsType}`,
        });
      }

      store.setRepositoryState(repository.getState());

      // Trigger re-render to update the view
      subject.dispatch("sceneEditor.renderCanvas", {});
    }
  }

  render();
};

export const handlePopoverClickOverlay = (deps) => {
  const { store, render } = deps;
  store.hidePopover();
  render();
};

export const handleFormActionClick = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const detail = payload._event.detail;

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

export const handleToggleSectionsGraphView = (deps) => {
  const { store, render } = deps;
  store.toggleSectionsGraphView();
  render();
};

export const handlePreviewClick = (deps) => {
  const { store, render } = deps;
  const sceneId = store.selectSceneId();
  store.showPreviewSceneId({ sceneId });
  render();
};

export const handleHidePreviewScene = async (deps) => {
  const { store, render, drenderer, getRefIds, fileManagerFactory, router } =
    deps;

  const { p } = router.getPayload();
  store.hidePreviewScene();
  render();

  const { canvas } = getRefIds();
  await drenderer.init({ canvas: canvas.elm });
  const fileManager = await fileManagerFactory.getByProject(p);
  await renderSceneState(store, drenderer, fileManager);
};

// Handler for throttled/debounced dialogue content updates
export const handleUpdateDialogueContent = async (deps, payload) => {
  const { repositoryFactory, router, store, subject } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
      if (line && line.actions?.dialogue) {
        existingDialogue = line.actions.dialogue;
      }
    }
  }

  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions`,
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

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

// Handler for debounced canvas rendering
async function handleRenderCanvas(payload, deps) {
  const { store, drenderer, fileManagerFactory, router } = deps;
  const { p } = router.getPayload();
  // Get fileManager for this project
  const fileManager = await fileManagerFactory.getByProject(p);
  await renderSceneState(store, drenderer, fileManager);
}

// RxJS subscriptions for handling events with throttling/debouncing
export const subscriptions = (deps) => {
  const { subject } = deps;

  return [
    // Debounce dialogue content updates by 2000ms (2 seconds)
    subject.pipe(
      filter(({ action }) => action === "updateDialogueContent"),
      debounceTime(2000),
      tap(({ payload }) => {
        deps.handlers.handleUpdateDialogueContent(deps, payload);
      }),
    ),
    // Debounce canvas renders by 50ms to prevent multiple renders on rapid navigation
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.renderCanvas"),
      debounceTime(50),
      tap(async ({ payload }) => {
        await handleRenderCanvas(payload, deps);
      }),
    ),
  ];
};
