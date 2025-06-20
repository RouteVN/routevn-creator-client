import { nanoid } from "nanoid";
import { toFlatItems } from "../../repository";

export const handleOnMount = (deps) => {
  const { store, router, render, repository, getRefIds } = deps;
  const { sceneId } = router.getPayload();
  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      steps: toFlatItems(section.steps),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });
  store.setSelectedSectionId(scene.sections[0].id);
  console.log('scene', scene)
};

export const handleSectionTabClick = (e, deps) => {
  const { store, render } = deps;
  const id = e.currentTarget.id.replace("section-tab-", "");
  store.setSelectedSectionId(id);
  render();
};

export const handleCommandLineSubmit = (e, deps) => {
  const { store, render, repository } = deps;
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const stepId = store.selectSelectedStepId();
  console.log('e.detail', e.detail)
  console.log('stepId', stepId)
  if (!stepId) {
    return;
  }
  store.setMode("steps-editor");
  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps.items.${stepId}.instructions.presentationInstructions`,
    value: {
      replace: false,
      item: e.detail
    },
  })

  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      steps: toFlatItems(section.steps),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });

  render();
};

export const handleEditorDataChanaged = (e, deps) => {
  const { repository, store } = deps;

  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  const stepId = e.detail.stepId;

  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps.items.${stepId}.instructions.presentationInstructions`,
    value: {
      replace: false,
      item: {
        dialogue: {
          text: e.detail.content,
        },
      },
    }
  })
  // actionType: "treePush",
  // target: `scenes.items.${sceneId}.sections`,
  // value: {
  //   parent: "_root",
  //   position: "last",
  //   item: {
  //     id: newSectionId,
  //     name: "Section New",
  //     steps: {
  //       items: {
  //         instructions: {
  //           presentationInstructions: {},
  //         },
  //       },
  //       tree: [
  //         {
  //           id: newStepId,
  //         },
  //       ],
  //     },
  //   },
  // },
};

export const handleAddInstructionButtonClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleSectionAddClick = (e, deps) => {
  const { store, repository, render } = deps;

  const sceneId = store.selectSceneId();
  const newSectionId = nanoid();
  const newStepId = nanoid();

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections`,
    value: {
      parent: "_root",
      position: "last",
      item: {
        id: newSectionId,
        name: "Section New",
        steps: {
          items: {
            instructions: {
              presentationInstructions: {},
            },
          },
          tree: [
            {
              id: newStepId,
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
  newScene.sections = toFlatItems(newScene.sections);
  store.setScene({
    id: sceneId,
    scene: newScene,
  });
  store.setSelectedSectionId(newSectionId);
  render();
};

export const handleSplitStep = (e, deps) => {
  const startTime = performance.now();
  console.log('🕐 handleSplitStep - START at', startTime);
  
  const { store, render, repository, getRefIds } = deps;

  const sceneId = store.selectSceneId();
  const newStepId = nanoid();
  const sectionId = store.selectSelectedSectionId();
  const { stepId, leftContent, rightContent } = e.detail;

  console.log('handleSplitStep - splitting step:', stepId);

  // Batch both operations into a single update cycle
  const repoStart = performance.now();
  console.log('🕐 Starting repository actions at', repoStart - startTime, 'ms');
  
  // First, update the current step with the left content
  repository.addAction({
    actionType: "treeUpdate",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps`,
    value: {
      id: stepId,
      replace: false,
      item: {
        instructions: {
          presentationInstructions: {
            dialogue: {
              text: leftContent,
            }
          },
        },
      },
    }
  });

  const updateDone = performance.now();
  console.log('🕐 Update action done at', updateDone - startTime, 'ms (took', updateDone - repoStart, 'ms)');

  // Then, create a new step with the right content and insert it after the current step
  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps`,
    value: {
      parent: "_root",
      position: { after: stepId },
      item: {
        id: newStepId,
        instructions: {
          presentationInstructions: {
            dialogue: {
              text: rightContent,
            }
          },
        },
      },
    },
  });

  const pushDone = performance.now();
  console.log('🕐 Push action done at', pushDone - startTime, 'ms (took', pushDone - updateDone, 'ms)');

  // Update the scene data
  const sceneDataStart = performance.now();
  console.log('🕐 Starting scene data update at', sceneDataStart - startTime, 'ms');
  
  const { scenes } = repository.getState();
  const scene = toFlatItems(scenes)
    .filter((item) => item.type === "scene")
    .find((item) => item.id === sceneId);
  scene.sections = toFlatItems(scene.sections).map((section) => {
    return {
      ...section,
      steps: toFlatItems(section.steps),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });

  const sceneDataDone = performance.now();
  console.log('🕐 Scene data update done at', sceneDataDone - startTime, 'ms (took', sceneDataDone - sceneDataStart, 'ms)');

  // Pre-configure the stepsEditor before rendering
  const configStart = performance.now();
  console.log('🕐 Starting pre-config at', configStart - startTime, 'ms');
  
  const refIds = getRefIds();
  const stepsEditorRef = refIds["steps-editor"];
  
  if (stepsEditorRef) {
    // Set cursor position to 0 (beginning of new step)
    stepsEditorRef.elm.store.setCursorPosition(0);
    stepsEditorRef.elm.store.setGoalColumn(0);
    stepsEditorRef.elm.store.setNavigationDirection('down');
    stepsEditorRef.elm.store.setIsNavigating(true);
  }
  
  // Update selectedStepId through the store (not directly in stepsEditor)
  store.setSelectedStepId(newStepId);

  const configDone = performance.now();
  console.log('🕐 Pre-config done at', configDone - startTime, 'ms (took', configDone - configStart, 'ms)');

  // Render and then focus immediately
  const renderStart = performance.now();
  console.log('🕐 Starting render at', renderStart - startTime, 'ms');
  
  render();
  
  const renderDone = performance.now();
  console.log('🕐 Render done at', renderDone - startTime, 'ms (took', renderDone - renderStart, 'ms)');
  
  // Use requestAnimationFrame for faster execution than setTimeout
  requestAnimationFrame(() => {
    const focusStart = performance.now();
    console.log('🕐 Starting focus at', focusStart - startTime, 'ms');
    
    if (stepsEditorRef) {
      stepsEditorRef.elm.transformedHandlers.updateSelectedStep(newStepId);
      
      const updateStepDone = performance.now();
      console.log('🕐 updateSelectedStep done at', updateStepDone - startTime, 'ms (took', updateStepDone - focusStart, 'ms)');
      
      // Also render the stepsEditor
      stepsEditorRef.elm.render();
      
      const finalRenderDone = performance.now();
      console.log('🕐 Final render done at', finalRenderDone - startTime, 'ms (took', finalRenderDone - updateStepDone, 'ms)');
      console.log('🕐 TOTAL handleSplitStep time:', finalRenderDone - startTime, 'ms');
    }
  });
};

export const handleNewLine = (e, deps) => {
  const { store, render, repository } = deps;

  const sceneId = store.selectSceneId();
  const newStepId = nanoid();
  const sectionId = store.selectSelectedSectionId();

  repository.addAction({
    actionType: "treePush",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps`,
    value: {
      parent: "_root",
      position: "last",
      item: {
        id: newStepId,
        instructions: {
          presentationInstructions: {},
        },
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
      steps: toFlatItems(section.steps),
    };
  });
  store.setScene({
    id: scene.id,
    scene,
  });

  render();
};

export const handleMoveUp = (e, deps) => {
  const { store, getRefIds, render } = deps;
  const currentStepId = e.detail.stepId;
  const previousStepId = store.selectPreviousStepId({ stepId: currentStepId });
  

  // Only move if we have a different previous step
  if (previousStepId && previousStepId !== currentStepId) {
    const refIds = getRefIds();
    const stepsEditorRef = refIds["steps-editor"];
    
    // Update selectedStepId through the store
    store.setSelectedStepId(previousStepId);
    
    // Pass cursor position from event detail
    if (e.detail.cursorPosition !== undefined) {
      if (e.detail.cursorPosition === -1) {
        // Special value: position at end of target step (for ArrowLeft navigation)
        const targetStepRef = refIds[`step-${previousStepId}`];
        const targetTextLength = targetStepRef?.elm?.textContent?.length || 0;
        stepsEditorRef.elm.store.setCursorPosition(targetTextLength);
        stepsEditorRef.elm.store.setGoalColumn(targetTextLength);
        stepsEditorRef.elm.store.setNavigationDirection('end'); // Special direction for end positioning
      } else {
        stepsEditorRef.elm.store.setCursorPosition(e.detail.cursorPosition);
        // Set direction flag in store before calling updateSelectedStep
        stepsEditorRef.elm.store.setNavigationDirection('up');
      }
    } else {
      // Set direction flag in store before calling updateSelectedStep
      stepsEditorRef.elm.store.setNavigationDirection('up');
    }
    stepsEditorRef.elm.transformedHandlers.updateSelectedStep(previousStepId);
    
    // Force a render to update line colors after navigation
    setTimeout(() => {
      render();
      // Also render the stepsEditor to update line colors
      stepsEditorRef.elm.render();
    }, 0);
  }
};

export const handleMoveDown = (e, deps) => {
  const { store, getRefIds, render } = deps;
  const currentStepId = e.detail.stepId;
  const nextStepId = store.selectNextStepId({ stepId: currentStepId });
  

  // Only move if we have a different next step
  if (nextStepId && nextStepId !== currentStepId) {
    const refIds = getRefIds();
    const stepsEditorRef = refIds["steps-editor"];
    
    // Update selectedStepId through the store
    store.setSelectedStepId(nextStepId);
    
    // Pass cursor position from event detail
    if (e.detail.cursorPosition !== undefined) {
      stepsEditorRef.elm.store.setCursorPosition(e.detail.cursorPosition);
      if (e.detail.cursorPosition === 0) {
        // When moving to beginning, set goal column to 0 as well
        stepsEditorRef.elm.store.setGoalColumn(0);
      }
    }
    
    // Set direction flag in store before calling updateSelectedStep
    stepsEditorRef.elm.store.setNavigationDirection('down');
    stepsEditorRef.elm.transformedHandlers.updateSelectedStep(nextStepId);
    
    // Force a render to update line colors after navigation
    setTimeout(() => {
      render();
      // Also render the stepsEditor to update line colors
      stepsEditorRef.elm.render();
    }, 0);
  }
};

export const handleMergeSteps = (e, deps) => {
  const { store, getRefIds, render, repository } = deps;
  const { prevStepId, currentStepId, contentToAppend } = e.detail;
  
  const sceneId = store.selectSceneId();
  const sectionId = store.selectSelectedSectionId();
  
  // Get previous step content
  const scene = store.selectScene();
  const section = scene.sections.find(s => s.id === sectionId);
  const prevStep = section.steps.find(s => s.id === prevStepId);
  
  if (!prevStep) return;
  
  const prevContent = prevStep.instructions?.presentationInstructions?.dialogue?.text || '';
  const mergedContent = prevContent + contentToAppend;
  
  // Store the length of the previous content for cursor positioning
  const prevContentLength = prevContent.length;
  
  // Update previous step with merged content
  repository.addAction({
    actionType: "set",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps.items.${prevStepId}.instructions.presentationInstructions`,
    value: {
      replace: false,
      item: {
        dialogue: {
          text: mergedContent,
        },
      },
    }
  });
  
  // Delete current step
  repository.addAction({
    actionType: "treeDelete",
    target: `scenes.items.${sceneId}.sections.items.${sectionId}.steps`,
    value: {
      id: currentStepId,
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
      steps: toFlatItems(section.steps),
    };
  });
  
  store.setScene({
    id: updatedScene.id,
    scene: updatedScene,
  });
  
  // Update selected step to the previous one
  store.setSelectedStepId(prevStepId);
  
  // Pre-configure the stepsEditor for cursor positioning
  const refIds = getRefIds();
  const stepsEditorRef = refIds["steps-editor"];
  
  if (stepsEditorRef) {
    // Set cursor position to where the previous content ended
    stepsEditorRef.elm.store.setCursorPosition(prevContentLength);
    stepsEditorRef.elm.store.setGoalColumn(prevContentLength);
    stepsEditorRef.elm.store.setIsNavigating(true);
  }
  
  // Render and then focus
  render();
  
  requestAnimationFrame(() => {
    if (stepsEditorRef) {
      stepsEditorRef.elm.transformedHandlers.updateSelectedStep(prevStepId);
      stepsEditorRef.elm.render();
      
    }
  });
};

export const handleBackgroundActionClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("actions");
  render();
};

export const handleBackgroundActionContextMenu = (e, deps) => {
  const { store, render } = deps;
  e.preventDefault();
  
  store.showInstructionDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    instructionType: 'background'
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
  
  store.showInstructionDropdownMenu({
    position: { x: e.clientX, y: e.clientY },
    instructionType: 'bgm'
  });
  render();
};

export const handleActionsOverlayClick = (e, deps) => {
  const { store, render } = deps;
  store.setMode("steps-editor");
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
  const instructionType = dropdownState.instructionType;
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
    newScene.sections = toFlatItems(newScene.sections);
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
  } else if (action === "delete-instruction") {
    // Delete instruction using unset action
    const selectedStepId = store.selectSelectedStepId();
    const selectedSectionId = store.selectSelectedSectionId();
    
    if (instructionType && selectedStepId && selectedSectionId) {
      repository.addAction({
        actionType: "unset",
        target: `scenes.items.${sceneId}.sections.items.${selectedSectionId}.steps.items.${selectedStepId}.instructions.presentationInstructions.${instructionType}`,
      });

      // Update scene data
      const { scenes } = repository.getState();
      const scene = toFlatItems(scenes)
        .filter((item) => item.type === "scene")
        .find((item) => item.id === sceneId);
      scene.sections = toFlatItems(scene.sections).map((section) => {
        return {
          ...section,
          steps: toFlatItems(section.steps),
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

export const handleStepSelectionChanged = (e, deps) => {
  const { store, render } = deps;
  const { stepId } = e.detail;
  
  store.setSelectedStepId(stepId);
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
      newScene.sections = toFlatItems(newScene.sections);
      store.setScene({
        id: sceneId,
        scene: newScene,
      });
    }

    render();
  }
};
