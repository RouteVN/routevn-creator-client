import { Transforms } from "slate";

export const handleOnMount = (deps) => {
  const { store } = deps;
  const { props } = store;
};

export const handleStepKeyDown = (e, deps) => {
  const { editor, dispatchEvent } = deps;
  let newOffset;
  switch (e.key) {
    case "Enter":
      e.preventDefault();
      requestAnimationFrame(() => {
        dispatchEvent(
          new CustomEvent("newLine", {
            detail: {
              // editor: editor,
            },
          })
        );
      });
    case "ArrowUp":
      e.preventDefault();
      dispatchEvent(
        new CustomEvent("moveUp", {
          detail: {
            stepId: e.currentTarget.id.replace(/^step-/, ""),
          },
        })
      );
      break;
    case "ArrowDown":
      e.preventDefault();
      dispatchEvent(
        new CustomEvent("moveDown", {
          detail: {
            stepId: e.currentTarget.id.replace(/^step-/, ""),
          },
        })
      );
      break;
    // case "ArrowRight":
    //   e.preventDefault();
    //   newOffset = Math.max(0, editor.selection.focus.offset + 1);
    //   Transforms.select(editor, {
    //     path: editor.selection.focus.path,
    //     offset: newOffset,
    //   });
    //   deps.handlers.updateSelection(e.currentTarget.id, deps);
    //   break;
    // case "ArrowLeft":
    //   e.preventDefault();
    //   newOffset = Math.max(0, editor.selection.focus.offset - 1);
    //   Transforms.select(editor, {
    //     path: editor.selection.focus.path,
    //     offset: newOffset,
    //   });
    //   deps.handlers.updateSelection(e.currentTarget.id, deps);
    //   break;
  }
  // const blockRef = deps.getRefIds()[e.currentTarget.id].elm;

  // blockRef.setAttribute('spellcheck', 'false');

  // requestAnimationFrame(() => {
  // deps.render();
  // })

  // setTimeout(() => {
  //   blockRef.setAttribute('spellcheck', 'true');
  //   deps.render();
  // }, 2000)

  // TODO fix spellcheck underline flickering
};

export const handleBlockMouseUp = (e, deps) => {
  const { editor } = deps;
  return;
  const domSelection = window.getSelection();
  if (!domSelection || !domSelection.rangeCount) return;

  const range = domSelection.getRangeAt(0);
  const startOffset = range.startOffset;
  const endOffset = range.endOffset;

  // Get the current node path based on the clicked element
  // const nodePath = path
  // const textPath = [...nodePath, 0] // Assuming each paragraph has text at index 0
  // const textNode = ref.children[0].firstChild;

  const blockId = e.currentTarget.id.split("-")[1];

  const index = editor.children.findIndex((child) => child.id === blockId);

  const textPath = [index, 0];
  // Update Slate's selection state - use the correct path
  editor.selection = {
    anchor: { path: textPath, offset: startOffset },
    focus: { path: textPath, offset: endOffset },
  };

  updateSelection(e.currentTarget.id, deps);
};

export const handleBlockBeforeInput = (e, deps) => {
  return;
  const { editor } = deps;
  const { store, render } = deps;
  // Input event
  e.preventDefault();

  // Skip insertion during IME composition
  // if (isComposing) return

  console.log("e.data", e.data);

  if (e.data) {
    Transforms.insertText(editor, e.data);
    store.setEditorChildren(editor.children);
    store.setEditorSelection(editor.selection);
    render();
    // requestAnimationFrame(() => {
    deps.handlers.updateSelection(e.currentTarget.id, deps);
    // })
  }
};

export const handleOnInput = (e, deps) => {
  return;
  const { editor } = deps;
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("editorDataChanaged", {
      detail: {
        editor: editor,
      },
    })
  );
};

export const updateSelection = (id, deps) => {
  return;
  const { editor } = deps;
  const ref = deps.getRefIds()[id].elm;
  const textNode = ref.children[0].firstChild;
  const range = document.createRange();
  range.setStart(textNode, editor.selection?.focus.offset);
  range.setEnd(textNode, editor.selection?.focus.offset);

  const selection = window.getSelection();
  if (selection) {
    // requestAnimationFrame(() => {
    selection.removeAllRanges();
    selection.addRange(range);
    // })

    // Focus the element
    // ref.focus();
  }
};

export const updateSelectedStep = (stepId, deps) => {
  const { store, getRefIds } = deps;
  console.log("getRefIds()", getRefIds());
  const stepRef = getRefIds()[`step-${stepId}`];
  console.log("stepRef", stepRef);
  stepRef.elm.focus();
  // store.setSelectedStepIndex(index);
};

export const handleOnFocus = (e, deps) => {
  console.log("focus", e);
  const { store, render } = deps;
  const stepId = e.currentTarget.id.replace(/^step-/, "");
  console.log("stepId", stepId);
  store.setSelectedStepId(stepId);
  render();
};

