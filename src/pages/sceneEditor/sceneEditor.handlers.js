import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository";

export const handleOnMount = (deps) => {
  const { store, router, render, repository, getRefIds, drenderer } = deps;
  const { sceneId } = router.getPayload();
  const { scenes, images } = repository.getState();


  setTimeout(() => {
    const { canvas } = getRefIds()
    console.log('canvas', drenderer.getCanvas())
    canvas.elm.appendChild(drenderer.getCanvas())
    store.setImages(images.items)
  }, 10)

  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      lines: toFlatItems(section.lines),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });
  store.setSelectedSectionId(scene.sections[0].id);
  store.setRepository(repository.getState());
};

export const handleSectionTabClick = (e, deps) => {
  const { store, render } = deps;
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
};

export const handleCommandLineSubmit = (e, deps) => {
  const { store, render, repository } = deps;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = store.selectSelectedLineId();

  if (!lineId) {
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

  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      lines: toFlatItems(section.lines),
    };
  });

  store.setScene({
    id: scene.id,
    scene,
  });
  store.setRepository(repository.getState());
  store.setMode("lines-editor");

  render();
};

export const handleEditorDataChanaged = (e, deps) => {
  const { repository, store } = deps;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const lineId = e.detail.lineId;

  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${lineId}.presentation`,
    value: {
      replace: false,
      item: {
        dialogue: {
          text: e.detail.content,
        },
      },
    },
  });
  // actionType: "treePush",
  // target: `scenes.items.${sceneId}.sections`,
  // value: {
  //   parent: "_root",
  //   position: "last",
  //   item: {
  //     id: newSectionId,
  //     name: "Section New",
  //     lines: {
  //       items: {
  //         presentation: {},
  //       },
  //       tree: [
  //         {
  //           id: newLineId,
  //         },
  //       ],
  //     },
  //   },
  // },
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

  const { scenes } = repository.getState();
  const newScene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  newScene.sections = toFlatItems(newScene.sections).map((section) => {
    return {
      ...section,
      lines: toFlatItems(section.lines),
    };
  });
  store.setScene({
    id: sceneId,
    scene: newScene,
  });
  store.setSelectedSectionId(newSectionId);
  render();
};

export const handleSplitLine = (e, deps) => {
  const startTime = performance.now();
  console.log("🕐 handleSplitLine - START at", startTime);

  const { store, render, repository, getRefIds } = deps;

  const sceneId = store.selectSceneId();
  const newLineId = nanoid();
  const sectionId = store.selectSelectedSectionId();
  const { lineId, leftContent, rightContent } = e.detail;

  console.log("handleSplitLine - splitting line:", lineId);

  // Batch both operations into a single update cycle
  const repoStart = performance.now();
  console.log("🕐 Starting repository actions at", repoStart - startTime, "ms");

  // First, update the current line with the left content
  repository.addAction({
    actionType: "treeUpdate",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
    value: {
      id: lineId,
      replace: false,
      item: {
        presentation: {
          dialogue: {
            text: leftContent,
          },
        },
      },
    },
  });

  const updateDone = performance.now();
  console.log(
    "🕐 Update action done at",
    updateDone - startTime,
    "ms (took",
    updateDone - repoStart,
    "ms)",
  );

  // Then, create a new line with the right content and insert it after the current line
  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines`,
    value: {
      parent: "_root",
      position: { after: lineId },
      item: {
        id: newLineId,
        presentation: {
          dialogue: {
            text: rightContent,
          },
        },
      },
    },
  });

  const pushDone = performance.now();
  console.log(
    "🕐 Push action done at",
    pushDone - startTime,
    "ms (took",
    pushDone - updateDone,
    "ms)",
  );

  // Update the scene data
  const sceneDataStart = performance.now();
  console.log(
    "🕐 Starting scene data update at",
    sceneDataStart - startTime,
    "ms",
  );

  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      lines: toFlatItems(section.lines),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });

  const sceneDataDone = performance.now();
  console.log(
    "🕐 Scene data update done at",
    sceneDataDone - startTime,
    "ms (took",
    sceneDataDone - sceneDataStart,
    "ms)",
  );

  // Pre-configure the linesEditor before rendering
  const configStart = performance.now();
  console.log("🕐 Starting pre-config at", configStart - startTime, "ms");

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

  const configDone = performance.now();
  console.log(
    "🕐 Pre-config done at",
    configDone - startTime,
    "ms (took",
    configDone - configStart,
    "ms)",
  );

  // Render and then focus immediately
  const renderStart = performance.now();
  console.log("🕐 Starting render at", renderStart - startTime, "ms");

  render();

  const renderDone = performance.now();
  console.log(
    "🕐 Render done at",
    renderDone - startTime,
    "ms (took",
    renderDone - renderStart,
    "ms)",
  );

  // Use requestAnimationFrame for faster execution than setTimeout
  requestAnimationFrame(() => {
    const focusStart = performance.now();
    console.log("🕐 Starting focus at", focusStart - startTime, "ms");

    if (linesEditorRef) {
      linesEditorRef.elm.transformedHandlers.updateSelectedLine(newLineId);

      const updateLineDone = performance.now();
      console.log(
        "🕐 updateSelectedLine done at",
        updateLineDone - startTime,
        "ms (took",
        updateLineDone - focusStart,
        "ms)",
      );

      // Also render the linesEditor
      linesEditorRef.elm.render();

      const finalRenderDone = performance.now();
      console.log(
        "🕐 Final render done at",
        finalRenderDone - startTime,
        "ms (took",
        finalRenderDone - updateLineDone,
        "ms)",
      );
      console.log(
        "🕐 TOTAL handleSplitLine time:",
        finalRenderDone - startTime,
        "ms",
      );
    }
  });
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

  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      lines: toFlatItems(section.lines),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });

  render();
};

export const handleMoveUp = (e, deps) => {
  const { store, getRefIds, render, drenderer, httpClient } = deps;
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

      const renderState = store.selectRenderState()
      console.log('renderState', renderState)

      setTimeout(async () => {
        const { url } = await httpClient.creator.getFileContent({ 
          fileId: 'NClcOC6ukuPmssECpMorp5A6', 
          projectId: 'someprojectId' 
        });
        await drenderer.loadAssets({
          'file:NClcOC6ukuPmssECpMorp5A6': {
            url,
            type: 'image/png',
          },
        })
        drenderer.render(renderState)
      }, 10)

    }, 0);
  }
};

export const handleBackToActions = (e, deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleMoveDown = (e, deps) => {
  const { store, getRefIds, render } = deps;
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

      const renderState = store.selectRenderState()
      console.log('renderState', renderState)
    }, 0);
  }
};

export const handleMergeLines = (e, deps) => {
  const { store, getRefIds, render, repository } = deps;
  const { prevLineId, currentLineId, contentToAppend } = e.detail;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();

  // Get previous line content
  const scene = store.selectScene();
  const section = scene.sections.find((s) => s.id === sectionId);
  const prevLine = section.lines.find((s) => s.id === prevLineId);

  if (!prevLine) return;

  const prevContent = prevLine.presentation?.dialogue?.text || "";
  const mergedContent = prevContent + contentToAppend;

  // Store the length of the previous content for cursor positioning
  const prevContentLength = prevContent.length;

  // Update previous line with merged content
  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.lines.items.${prevLineId}.presentation`,
    value: {
      replace: false,
      item: {
        dialogue: {
          text: mergedContent,
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
  const { scenes } = repository.getState();
  const updatedScene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  updatedScene.sections = toFlatItems(updatedScene.sections).map((section) => {
    return {
      ...section,
      lines: toFlatItems(section.lines),
    };
  });

  store.setScene({
    id: updatedScene.id,
    scene: updatedScene,
  });

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
};

export const handleBackgroundActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("background");
  render();
};

export const handleBackgroundActionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  store.showPresentationDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    presentationType: "background",
  });
  render();
};

export const handleBgmActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("bgm");
  render();
};

export const handleBgmActionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  store.showPresentationDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    presentationType: "bgm",
  });
  render();
};

export const handleSoundEffectActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("soundeffects");
  render();
};

export const handleSoundEffectActionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  store.showPresentationDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    presentationType: "soundEffects",
  });
  render();
};

export const handleCharactersActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("characters");
  render();
};

export const handleCharactersActionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  store.showPresentationDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    presentationType: "characters",
  });
  render();
};

export const handleSceneTransitionActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("scenetransition");
  render();
};

export const handleSceneTransitionActionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();

  store.showPresentationDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    presentationType: "sceneTransition",
  });
  render();
};

export const handleActionsOverlayClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("lines-editor");
  render();
};

export const handleActionsContainerClick = (e, deps) => {
  e.stopPropagation();
};

export const handleActionClicked = (e, deps) => {
  const { store, render } = deps;
  // console.log('e.deatil', e.detail)
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

    // Update scene data and select first remaining section
    const { scenes } = repository.getState();
    const newScene = toFlatItems(scenes)
      .filter((item) => item.type === "scene")
      .find((item) => item.id === sceneId);
    newScene.sections = toFlatItems(newScene.sections).map((section) => {
      return {
        ...section,
        lines: toFlatItems(section.lines),
      };
    });
    store.setScene({
      id: sceneId,
      scene: newScene,
    });

    if (newScene.sections.length > 0) {
      store.setSelectedSectionId(newScene.sections[0].id);
    }
  } else if (action === "rename-section") {
    // Show rename popover using the stored position
    store.showPopover({
      position,
      sectionId,
    });
      } else if (action === "delete-presentation") {
      // Delete presentation using unset action
      const selectedLineId = store.selectSelectedLineId();
      const selectedSectionId = store.selectSelectedSectionId();

      if (presentationType && selectedLineId && selectedSectionId) {
        repository.addAction({
          actionType: "unset",
          target: `scenes.items.${sceneId}.sections.items.${selectedSectionId}.lines.items.${selectedLineId}.presentation.${presentationType}`,
        });

      // Update scene data
      const { scenes } = repository.getState();
      const scene = toFlatItems(scenes)
        .filter((item) => item.type === "scene")
        .find((item) => item.id === sceneId);
      scene.sections = toFlatItems(scene.sections).map((section) => {
        return {
          ...section,
          lines: toFlatItems(section.lines),
        };
      });
      store.setScene({
        id: scene.id,
        scene,
      });
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
  const { store, render } = deps;
  const { lineId } = e.detail;

  store.setSelectedLineId(lineId);
  render();
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

      // Update scene data
      const { scenes } = repository.getState();
      const newScene = toFlatItems(scenes)
        .filter((item) => item.type === "scene")
        .find((item) => item.id === sceneId);
      newScene.sections = toFlatItems(newScene.sections).map((section) => {
        return {
          ...section,
          lines: toFlatItems(section.lines),
        };
      });
      store.setScene({
        id: sceneId,
        scene: newScene,
      });
    }

    render();
  }
};

export const handleToggleSectionsGraphView = (e, deps) => {
  const { store, render } = deps;
  store.toggleSectionsGraphView();
  render();
  console.log("render");
};
