import { nanoid } from "nanoid";
import { toFlatItems } from "insieme";
import { extractFileIdsFromRenderState } from "../../utils/index.js";
import { filter, tap, debounceTime, groupBy, mergeMap } from "rxjs";

// Helper function to create assets object from file references
async function createAssetsFromFileIds(
  fileReferences,
  projectService,
  resources,
) {
  const { sounds, images, fonts = {} } = resources;
  const allItems = Object.entries({
    ...sounds,
    ...images,
    ...fonts,
  }).map(([key, val]) => {
    return {
      id: key,
      ...val,
    };
  });
  const assets = {};
  for (const fileObj of fileReferences) {
    const { url: fileId } = fileObj;
    const foundItem = allItems.find((item) => item.fileId === fileId);
    try {
      const { url } = await projectService.getFileContent(fileId);
      let type = foundItem?.fileType; // Use type from fileObj first

      // If no type in fileObj, look it up in the resources
      if (!type) {
        Object.entries(sounds.items || {})
          .concat(Object.entries(images.items || {}))
          .concat(Object.entries(fonts.items || {}))
          .forEach(([_key, item]) => {
            if (item.fileId === fileId) {
              type = item.fileType;
            }
          });
      }

      assets[fileId] = {
        url,
        type: type || "image/png", // fallback to image/png
      };
    } catch (error) {
      console.error(`Failed to load file ${fileId}:`, error);
    }
  }

  console.log("assets", assets);
  return assets;
}

// Helper function to render the scene state
async function renderSceneState(store, graphicsService) {
  const projectData = store.selectProjectData();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();
  graphicsService.engineHandleActions({
    updateProjectData: {
      projectData,
    },
    jumpToLine: {
      sectionId,
      lineId,
    },
  });
  graphicsService.engineRenderCurrentState();

  // Update presentation state after rendering
  const presentationState = graphicsService.engineSelectPresentationState();
  store.setPresentationState(presentationState);
}

export const handleBeforeMount = (deps) => {
  const { graphicsService } = deps;

  return () => {
    graphicsService.destroy();
  };
};

async function updateSectionChanges(deps) {
  const { store, graphicsService } = deps;
  const sectionId = store.selectSelectedSectionId();
  if (!sectionId) return;

  const changes = graphicsService.engineSelectSectionLineChanges({ sectionId });
  store.setSectionLineChanges(changes);
}

export const handleAfterMount = async (deps) => {
  const {
    getRefIds,
    graphicsService,
    store,
    projectService,
    appService,
    render,
  } = deps;

  // Ensure repository is loaded for sync access
  await projectService.ensureRepository();

  // Get sceneId from router payload
  const { sceneId } = appService.getPayload();
  const state = projectService.getState();

  store.setSceneId(sceneId);
  store.setRepositoryState(state);

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

  const { canvas } = getRefIds();

  await graphicsService.init({ canvas: canvas.elm });
  const projectData = store.selectProjectData();

  graphicsService.initRouteEngine(projectData);
  // TODO don't load all data... only ones necessary for this scene
  const fileReferences = extractFileIdsFromRenderState(projectData);
  const assets = await createAssetsFromFileIds(
    fileReferences,
    projectService,
    projectData.resources,
  );
  await graphicsService.loadAssets(assets);
  // don't know why but it needs to be called twice the first time to work...
  renderSceneState(store, graphicsService);

  await updateSectionChanges(deps);

  render();
};

export const handleSectionTabClick = async (deps, payload) => {
  const { store, render, subject } = deps;
  const id = payload._event.currentTarget.id.replace("section-tab-", "");
  store.setSelectedSectionId(id);
  const scene = store.selectScene();
  const newSection = scene.sections.find((section) => section.id === id);
  if (newSection && newSection.lines && newSection.lines.length > 0) {
    store.setSelectedLineId(newSection.lines[0].id);
  } else {
    store.setSelectedLineId(undefined);
  }

  await updateSectionChanges(deps);

  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleCommandLineSubmit = async (deps, payload) => {
  const { store, render, projectService, subject, graphicsService } = deps;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();

  // Handle section/scene transitions
  if (payload._event.detail.sectionTransition) {
    if (!lineId) {
      console.warn("Section transition requires a selected line");
      return;
    }

    await projectService.appendEvent({
      type: "set",
      payload: {
        target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions`,
        value: payload._event.detail,
        options: {
          replace: false,
        },
      },
    });

    const state = projectService.getState();
    store.setRepositoryState(state);
    render();

    // Render the canvas with the latest data
    setTimeout(async () => {
      await renderSceneState(store, graphicsService);
    }, 10);
    return;
  }

  if (!lineId) {
    return;
  }

  let submissionData = payload._event.detail;

  // If this is a dialogue submission, preserve the existing content
  if (submissionData.dialogue) {
    const line = store.selectSelectedLine();
    if (line && line.actions?.dialogue?.content) {
      // Preserve existing text
      submissionData = {
        ...submissionData,
        dialogue: {
          content: line.actions.dialogue.content,
          // layoutId: line.actions.dialogue.layoutId,
          ...submissionData.dialogue,
        },
      };
    }
  }

  await projectService.appendEvent({
    type: "set",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions`,
      value: submissionData,
      options: {
        replace: false,
      },
    },
  });

  const state = projectService.getState();
  store.setRepositoryState(state);
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

  // Trigger debounced canvas render with skipRender flag.
  // skipRender prevents full UI re-render which would reset cursor position while typing.
  // Typing only updates dialogue content, not presentationState, so State panel doesn't need to update.
  subject.dispatch("sceneEditor.renderCanvas", { skipRender: true });
};

export const handleAddActionsButtonClick = (deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleSectionAddClick = async (deps) => {
  const { store, projectService, render, graphicsService } = deps;

  const sceneId = store.selectSceneId();
  const newSectionId = nanoid();
  const newLineId = nanoid();

  // Get current scene to count sections
  const scene = store.selectScene();
  const sectionCount = scene?.sections?.length || 0;
  const newSectionName = `Section ${sectionCount + 1}`;

  // Get layouts from repository to find first dialogue and base layouts
  const { layouts } = projectService.getState();
  let dialogueLayoutId = null;
  let baseLayoutId = null;

  if (layouts && layouts.items) {
    for (const [layoutId, layout] of Object.entries(layouts.items)) {
      if (!dialogueLayoutId && layout.layoutType === "dialogue") {
        dialogueLayoutId = layoutId;
      }
      if (!baseLayoutId && layout.layoutType === "base") {
        baseLayoutId = layoutId;
      }
      if (dialogueLayoutId && baseLayoutId) {
        break;
      }
    }
  }

  // Create actions object with dialogue and base layouts if found
  const actions = {
    dialogue: dialogueLayoutId
      ? {
          gui: {
            resourceId: dialogueLayoutId,
          },
          mode: "adv",
          content: [{ text: "" }],
        }
      : {
          mode: "adv",
          content: [{ text: "" }],
        },
  };

  if (baseLayoutId) {
    actions.base = {
      resourceId: baseLayoutId,
      resourceType: "layout",
    };
  }

  await projectService.appendEvent({
    type: "treePush",
    payload: {
      target: `scenes.items.${sceneId}.sections`,
      value: {
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
      options: {
        parent: "_root",
        position: "last",
      },
    },
  });

  // Update store with new repository state
  const state = projectService.getState();
  store.setRepositoryState(state);

  store.setSelectedSectionId(newSectionId);
  store.setSelectedLineId(newLineId);
  render();

  // Render the canvas with the new section's data
  setTimeout(async () => {
    await renderSceneState(store, graphicsService);
  }, 10);
};

export const handleSplitLine = async (deps, payload) => {
  const { projectService, store, render, getRefIds, subject } = deps;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent } = payload._event.detail;

  // Check if this line is already being processed (split/merge)
  const lockingLineId = store.selectLockingLineId();

  if (lockingLineId === lineId) {
    return;
  }

  // Mark this line as being processed IMMEDIATELY to prevent duplicate operations
  store.setLockingLineId(lineId);

  const newLineId = nanoid();

  // First, persist any temporary line changes from the store to the repository
  // This ensures edits to other lines aren't lost when we update the repository
  const storeState = store.selectRepositoryState();
  const storeScene = toFlatItems(storeState.scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);

  if (storeScene) {
    for (const section of toFlatItems(storeScene.sections)) {
      for (const line of toFlatItems(section.lines)) {
        // Skip the line being split
        if (
          line.id !== lineId &&
          line.actions?.dialogue?.content !== undefined
        ) {
          const content = line.actions.dialogue.content;
          const isEmptyContent =
            !content ||
            content.length === 0 ||
            (content.length === 1 && content[0].text === "");

          if (isEmptyContent) {
            console.log(
              `[LE] handleSplitLine | Skipping flush for line ${line.id} because content is empty.`,
            );
            continue;
          }

          // Persist this line's content to the repository
          await projectService.appendEvent({
            type: "set",
            payload: {
              target: `scenes.items.${sceneId}.sections.items.${section.id}.lines.items.${line.id}.actions.dialogue.content`,
              value: line.actions.dialogue.content,
              options: {
                replace: true,
              },
            },
          });
        }
      }
    }
  }

  // Get existing actions data to preserve everything except dialogue content
  const { scenes } = projectService.getState();
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
  const leftContentArray = leftContent ? [{ text: leftContent }] : [];
  console.log(
    `[LE] handleSplitLine | lineId: ${lineId} | leftContent: "${leftContent}" | leftContentArray:`,
    JSON.stringify(leftContentArray),
  );
  if (existingDialogue && Object.keys(existingDialogue).length > 0) {
    // If dialogue exists, update only the content
    await projectService.appendEvent({
      type: "set",
      payload: {
        target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions.dialogue.content`,
        value: leftContentArray,
        options: {
          replace: true,
        },
      },
    });
  } else if (leftContent) {
    // If no dialogue exists but we have content, create minimal dialogue
    await projectService.appendEvent({
      type: "set",
      payload: {
        target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions.dialogue`,
        value: {
          content: leftContentArray,
        },
      },
    });
  }

  // Then, create a new line with the right content and insert it after the current line
  // New line should have empty actions except for dialogue.content
  const rightContentArray = rightContent ? [{ text: rightContent }] : [];
  console.log(
    `[LE] handleSplitLine | lineId: ${lineId} | rightContent: "${rightContent}" | rightContentArray:`,
    JSON.stringify(rightContentArray),
    "| newLineId:",
    newLineId,
  );
  const newLineActions = rightContent
    ? {
        dialogue: {
          content: rightContentArray,
          mode: "adv",
        },
      }
    : {};

  await projectService.appendEvent({
    type: "treePush",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
      value: {
        id: newLineId,
        actions: newLineActions,
      },
      options: {
        parent: "_root",
        position: { after: lineId },
      },
    },
  });

  // Update store with new repository state (pending updates were already flushed)
  const state = projectService.getState();
  store.setRepositoryState(state);

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
    if (
      leftContent === "" &&
      linesEditorRef &&
      linesEditorRef.elm?.shadowRoot
    ) {
      const oldLineElement = linesEditorRef.elm.shadowRoot.querySelector(
        `#line-${lineId}`,
      );
      if (oldLineElement) {
        console.log(
          `[LE] handleSplitLine | Clearing old line ${lineId} content because split happened at start.`,
        );
        oldLineElement.textContent = "";
        const inputEvent = new Event("input", { bubbles: true });
        oldLineElement.dispatchEvent(inputEvent);
      }
    }

    if (linesEditorRef) {
      linesEditorRef.elm.transformedHandlers.updateSelectedLine({
        currentLineId: newLineId,
      });

      // Also render the linesEditor
      linesEditorRef.elm.render();
    }

    // Clear the splitting lock - allows new line to be split if Enter is still held
    requestAnimationFrame(() => {
      store.clearLockingLineId();
    });
  });

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleNewLine = async (deps) => {
  const { store, render, projectService } = deps;

  const sceneId = store.selectSceneId();
  const newLineId = nanoid();
  const sectionId = store.selectSelectedSectionId();

  await projectService.appendEvent({
    type: "treePush",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
      value: {
        id: newLineId,
        actions: {},
      },
      options: {
        parent: "_root",
        position: "last",
      },
    },
  });

  render();
};

export const handleLineNavigation = (deps, payload) => {
  const { store, getRefIds, render, subject, graphicsService } = deps;
  const { targetLineId, mode, direction, targetCursorPosition, lineRect } =
    payload._event.detail;

  // For block mode, just update the selection and handle scrolling
  if (mode === "block") {
    const currentLineId = store.selectSelectedLineId();

    // console.log({
    //   currentLineId,
    //   targetLineId,
    //   direction,
    // });

    // Check if we're trying to move up from the first line
    if (direction === "up" && currentLineId === targetLineId) {
      // First line - show animation effects
      graphicsService.render({
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
    render();
    return;
  }

  // For text-editor mode, handle cursor navigation
  const currentLineId = store.selectSelectedLineId();
  let nextLineId = targetLineId;

  // Determine next line based on direction if targetLineId is current line
  if (targetLineId === currentLineId) {
    if (direction === "up" || direction === "end") {
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
          // Set a large goal column - updateSelectedLine will clamp to actual text length
          // when direction is "end"
          linesEditorRef.elm.store.setCursorPosition(Number.MAX_SAFE_INTEGER);
          linesEditorRef.elm.store.setGoalColumn(Number.MAX_SAFE_INTEGER);
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

      linesEditorRef.elm.transformedHandlers.updateSelectedLine({
        currentLineId: nextLineId,
      });
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
    graphicsService.render({
      elements: [],
      transitions: [],
    });
    render();
    subject.dispatch("sceneEditor.renderCanvas", {});
  }
};

export const handleMergeLines = async (deps, payload) => {
  const { store, getRefIds, render, projectService, subject } = deps;
  const { prevLineId, currentLineId, contentToAppend } = payload._event.detail;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  // Check if this line is already being processed (split/merge)
  const lockingLineId = store.selectLockingLineId();

  if (lockingLineId === currentLineId) {
    return;
  }

  store.setLockingLineId(currentLineId);

  // First, persist any temporary line changes from the store to the repository
  // This ensures edits to other lines aren't lost when we update the repository
  const storeState = store.selectRepositoryState();
  const storeScene = toFlatItems(storeState.scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);

  if (storeScene) {
    for (const section of toFlatItems(storeScene.sections)) {
      for (const line of toFlatItems(section.lines)) {
        // Skip the lines being merged
        if (
          line.id !== prevLineId &&
          line.id !== currentLineId &&
          line.actions?.dialogue?.content !== undefined
        ) {
          // Check if content is empty to avoid saving { text: "" } structure
          const content = line.actions.dialogue.content;
          const isEmptyContent =
            !content ||
            content.length === 0 ||
            (content.length === 1 && content[0].text === "");

          if (isEmptyContent) {
            // Skip saving empty content - don't persist { text: "" }
            console.log(
              `[LE] handleMergeLines | Skipping flush for line ${line.id} because content is empty.`,
            );
            continue;
          }

          // Persist this line's content to the repository
          await projectService.appendEvent({
            type: "set",
            payload: {
              target: `scenes.items.${sceneId}.sections.items.${section.id}.lines.items.${line.id}.actions.dialogue.content`,
              value: line.actions.dialogue.content,
              options: {
                replace: true,
              },
            },
          });
        }
      }
    }
  }

  // Get previous line content and existing dialogue properties
  const scene = store.selectScene();
  const section = scene.sections.find((s) => s.id === sectionId);
  const prevLine = section.lines.find((s) => s.id === prevLineId);

  if (!prevLine) {
    return;
  }

  // Get previous line content - it's an array of content objects
  const prevContentArray = prevLine.actions?.dialogue?.content || [];
  const prevContentText = prevContentArray.map((c) => c.text || "").join("");
  const mergedContent = prevContentText + contentToAppend;

  // Store the length of the previous content for cursor positioning
  const prevContentLength = prevContentText.length;

  // Get existing dialogue data to preserve layoutId and characterId
  let existingDialogue = {};
  if (prevLine.actions?.dialogue) {
    existingDialogue = prevLine.actions.dialogue;
  }

  const finalContent = [{ text: mergedContent }];
  // Update previous line with merged content
  await projectService.appendEvent({
    type: "set",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${prevLineId}.actions.dialogue`,
      value: {
        ...existingDialogue,
        content: finalContent,
      },
      options: {
        replace: true,
      },
    },
  });

  // Delete current line
  await projectService.appendEvent({
    type: "treeDelete",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
      options: {
        id: currentLineId,
      },
    },
  });

  // Update repository state in store to reflect the changes
  const state = projectService.getState();
  store.setRepositoryState(state);

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
      linesEditorRef.elm.transformedHandlers.updateSelectedLine({
        currentLineId: prevLineId,
      });
      linesEditorRef.elm.render();
    }

    requestAnimationFrame(() => {
      store.clearLockingLineId();
    });
  });

  // Trigger debounced canvas render
  subject.dispatch("sceneEditor.renderCanvas", {});
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
  const { store, render, projectService, subject } = deps;
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
    await projectService.appendEvent({
      type: "treeDelete",
      payload: {
        target: `scenes.items.${sceneId}.sections`,
        options: {
          id: sectionId,
        },
      },
    });

    // Update store with new repository state
    const state = projectService.getState();
    store.setRepositoryState(state);

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
        const stateBefore = projectService.getState();
        const currentActions =
          stateBefore.scenes?.items?.[sceneId]?.sections?.items?.[
            selectedSectionId
          ]?.lines?.items?.[selectedLineId]?.actions;

        if (currentActions?.dialogue) {
          // Keep content if it exists, remove layoutId and characterId
          const updatedDialogue = {
            content: currentActions.dialogue.content,
          };

          await projectService.appendEvent({
            type: "set",
            payload: {
              target: `scenes.items.${sceneId}.sections.items.${selectedSectionId}.lines.items.${selectedLineId}.actions.dialogue`,
              value: updatedDialogue,
              options: {
                replace: true,
              },
            },
          });
        }
      } else {
        // For all other actions types, use unset to remove completely
        await projectService.appendEvent({
          type: "unset",
          payload: {
            target: `scenes.items.${sceneId}.sections.items.${selectedSectionId}.lines.items.${selectedLineId}.actions.${actionsType}`,
          },
        });
      }

      const state = projectService.getState();
      store.setRepositoryState(state);

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
  const { store, render, projectService } = deps;
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
      await projectService.appendEvent({
        type: "treeUpdate",
        payload: {
          target: `scenes.items.${sceneId}.sections`,
          value: {
            name: values.name,
          },
          options: {
            id: sectionId,
            replace: false,
          },
        },
      });

      // Update store with new repository state
      const state = projectService.getState();
      store.setRepositoryState(state);
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

export const handleLineDeleteActionItem = async (deps, payload) => {
  const { store, subject, render, projectService } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine || !selectedLine.actions) {
    console.log("⚠️ No selected line or actions found");
    return;
  }
  // Create a new actions object without the action to delete
  const newActions = { ...selectedLine.actions };
  if (newActions.hasOwnProperty(actionType)) {
    if (actionType === "dialogue") {
      newActions[actionType] = {
        content: newActions[actionType].content,
      };
    } else {
      delete newActions[actionType];
    }
  }
  // Create updated line object
  const updatedLine = {
    ...selectedLine,
    actions: newActions,
  };

  // Save directly to repository - this will update the state
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
      value: updatedLine,
      options: {
        id: selectedLine.id,
        replace: true,
      },
    },
  });
  // Update store with new repository state
  const state = projectService.getState();
  store.setRepositoryState(state);
  // Trigger re-render
  render();
  subject.dispatch("sceneEditor.renderCanvas", {});
};

export const handleHidePreviewScene = async (deps) => {
  const { store, render, graphicsService, getRefIds } = deps;

  store.hidePreviewScene();
  render();

  const { canvas } = getRefIds();
  await graphicsService.init({ canvas: canvas.elm });

  const projectData = store.selectProjectData();
  graphicsService.initRouteEngine(projectData);

  await renderSceneState(store, graphicsService);
};

// Handler for throttled/debounced dialogue content updates
export const handleUpdateDialogueContent = async (deps, payload) => {
  const { projectService, store, subject } = deps;
  const { lineId, content } = payload;

  // Skip saving if content is empty (avoids creating { text: "" } structure)
  const isEmptyContent =
    !content ||
    content.length === 0 ||
    (content.length === 1 && content[0].text === "");

  if (isEmptyContent) {
    return;
  }

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  // Get existing dialogue data to preserve layoutId and characterId
  const { scenes } = projectService.getState();
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

  await projectService.appendEvent({
    type: "set",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.actions.dialogue`,
      value: {
        ...existingDialogue,
        content: content,
      },
      options: {
        replace: true,
      },
    },
  });
  subject.dispatch("sceneEditor.renderCanvas", { skipRender: true });
};

// Handler for debounced canvas rendering
async function handleRenderCanvas(deps, payload) {
  const { store, graphicsService, render } = deps;
  await renderSceneState(store, graphicsService);
  await updateSectionChanges(deps);

  if (!payload?.skipRender) {
    render();
  }
}

// RxJS subscriptions for handling events with throttling/debouncing
export const subscriptions = (deps) => {
  const { subject } = deps;

  return [
    // Debounce dialogue content updates by 2000ms (2 seconds) per line ID
    // TODO: Consider flushing pending debounced updates when subscription is cancelled to prevent data loss
    subject.pipe(
      filter(({ action }) => action === "updateDialogueContent"),
      groupBy(({ payload }) => payload.lineId), // Group by line ID to debounce each line separately
      mergeMap((group) => group.pipe(debounceTime(2000))),
      tap(({ payload }) => {
        deps.handlers.handleUpdateDialogueContent(deps, payload);
      }),
    ),
    // Debounce canvas renders by 50ms to prevent multiple renders on rapid navigation
    subject.pipe(
      filter(({ action }) => action === "sceneEditor.renderCanvas"),
      debounceTime(50),
      tap(async ({ payload }) => {
        await handleRenderCanvas(deps, payload);
      }),
    ),
  ];
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  const { p } = appService.getPayload();
  appService.navigate("/project/scenes", { p });
};

export const handleSystemActionsActionDelete = async (deps, payload) => {
  const { store, render, projectService, subject } = deps;
  const { actionType } = payload._event.detail;
  // Get current selected line
  const selectedLine = store.selectSelectedLine();
  if (!selectedLine || !selectedLine.actions) {
    console.log("⚠️ No selected line or actions found");
    return;
  }
  // Create a new actions object without the action to delete
  const newActions = structuredClone(selectedLine.actions);
  if (actionType === "dialogue") {
    newActions[actionType].clear = true;
  } else {
    newActions[actionType] = {};
  }
  // Create updated line object
  const updatedLine = {
    ...selectedLine,
    actions: newActions,
  };

  // Save directly to repository - this will update the state
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
      value: updatedLine,
      options: {
        id: selectedLine.id,
        replace: true,
      },
    },
  });
  // Update store with new repository state
  const state = projectService.getState();
  store.setRepositoryState(state);
  // Trigger re-render
  render();

  subject.dispatch("sceneEditor.renderCanvas", {});
};
