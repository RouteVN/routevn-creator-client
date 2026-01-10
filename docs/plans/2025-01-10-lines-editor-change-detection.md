# Lines Editor Change Detection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update the Lines Editor to show asset changes (add/update/delete) by comparing previous line presentation state with current line actions, showing sprites for visual assets and "x" icons for deleted items.

**Architecture:** Compute a running presentation state while iterating through lines. For each line, compare the state before and after applying the line's actions to detect changes. Show only the changes (add/update/delete) in the UI, not the full state.

**Tech Stack:** JavaScript (Rettangoli framework), YAML templates

**Key Concepts:**
- `presentationState` - The cumulative state after applying all actions up to a line
- `changes = f(prevLinePresentationState, currentLineActions)` - Compute delta between states
- `add`/`update` → show sprite (except music/sound → show icon)
- `delete` → show sprite with "x" overlay (using x-close.svg icon)

**Reference Documentation:** `docs/Scene-editor.md` lines 10-25

---

## Task 1: Add Helper Functions for Change Detection

**Files:**
- Modify: `src/components/linesEditor/linesEditor.store.js` (add after line 1, after the import)

**Step 1: Add helper function to get character sprite fileId**

Add this function after the `import` statement:

```javascript
// Get character sprite fileId from presentation state character
function getCharacterSpriteFileId(char, repositoryState) {
  const character = repositoryState?.characters?.items?.[char.id];
  if (char.sprites?.[0]?.imageId && character?.sprites) {
    const spriteId = char.sprites[0].imageId;
    return character.sprites?.items?.[spriteId]?.fileId;
  }
  return null;
}
```

**Step 2: Add helper function to compute changes between states**

Add after the previous function:

```javascript
// Compute changes between two presentation states
function computeChanges(prevState, currentState, repositoryState) {
  const changes = {
    characters: { added: [], updated: [], deleted: [] },
    background: null,
    dialogue: null,
    base: null,
    bgm: null,
  };

  // Character changes
  const prevChars = new Map();
  if (prevState.characters?.items) {
    prevState.characters.items.forEach((char) => prevChars.set(char.id, char));
  }
  const currentChars = new Map();
  if (currentState.characters?.items) {
    currentState.characters.items.forEach((char) => currentChars.set(char.id, char));
  }

  // Added characters
  for (const [id, char] of currentChars) {
    if (!prevChars.has(id)) {
      const fileId = getCharacterSpriteFileId(char, repositoryState);
      if (fileId) changes.characters.added.push({ id, fileId });
    }
  }

  // Updated characters (sprite changed)
  for (const [id, char] of currentChars) {
    if (prevChars.has(id)) {
      const prevChar = prevChars.get(id);
      if (prevChar.sprites?.[0]?.imageId !== char.sprites?.[0]?.imageId) {
        const fileId = getCharacterSpriteFileId(char, repositoryState);
        if (fileId) changes.characters.updated.push({ id, fileId });
      }
    }
  }

  // Deleted characters
  for (const [id, char] of prevChars) {
    if (!currentChars.has(id)) {
      const fileId = getCharacterSpriteFileId(char, repositoryState);
      if (fileId) changes.characters.deleted.push({ id, fileId });
    }
  }

  // Background changes
  const prevBg = prevState.background;
  const currBg = currentState.background;
  if (prevBg && !currBg) {
    const fileId = repositoryState?.images?.items?.[prevBg.resourceId]?.fileId || null;
    changes.background = { type: "deleted", fileId };
  } else if (!prevBg && currBg) {
    const fileId = repositoryState?.images?.items?.[currBg.resourceId]?.fileId || null;
    changes.background = { type: "added", fileId };
  } else if (prevBg && currBg && prevBg.resourceId !== currBg.resourceId) {
    const fileId = repositoryState?.images?.items?.[currBg.resourceId]?.fileId || null;
    changes.background = { type: "updated", fileId };
  }

  // Dialogue changes
  const prevDialogue = prevState.dialogue;
  const currDialogue = currentState.dialogue;
  if (prevDialogue && !currDialogue) {
    changes.dialogue = { type: "deleted" };
  } else if (!prevDialogue && currDialogue) {
    changes.dialogue = { type: "added" };
  } else if (prevDialogue && currDialogue && prevDialogue.gui?.resourceId !== currDialogue.gui?.resourceId) {
    changes.dialogue = { type: "updated" };
  }

  // Base changes
  const prevBase = prevState.base;
  const currBase = currentState.base;
  if (prevBase && !currBase) {
    changes.base = { type: "deleted" };
  } else if (!prevBase && currBase) {
    changes.base = { type: "added" };
  } else if (prevBase && currBase && prevBase.resourceId !== currBase.resourceId) {
    changes.base = { type: "updated" };
  }

  // BGM changes
  const prevBgm = prevState.bgm;
  const currBgm = currentState.bgm;
  if (prevBgm && !currBgm) {
    changes.bgm = { type: "deleted" };
  } else if (!prevBgm && currBgm) {
    changes.bgm = { type: "added" };
  } else if (prevBgm && currBgm && prevBgm.resourceId !== currBgm.resourceId) {
    changes.bgm = { type: "updated" };
  }

  return changes;
}
```

**Step 3: Add helper function to apply actions to state**

Add after the previous function:

```javascript
// Apply line actions to presentation state
function applyActionsToState(presentationState, actions) {
  const newState = { ...presentationState };

  // Characters - replace entire list
  if (actions.character) {
    if (actions.character.items && actions.character.items.length > 0) {
      newState.characters = {
        items: actions.character.items.map((char) => ({
          id: char.id,
          sprites: char.sprites || [],
        })),
      };
    } else {
      delete newState.characters;
    }
  }

  // Background
  if (actions.background) {
    newState.background = actions.background;
  }

  // Dialogue
  if (actions.dialogue) {
    if (actions.dialogue.clear) {
      delete newState.dialogue;
    } else if (actions.dialogue.gui) {
      newState.dialogue = actions.dialogue;
    }
  }

  // Base
  if (actions.base?.resourceId) {
    newState.base = actions.base;
  }

  // BGM
  if (actions.bgm) {
    newState.bgm = actions.bgm;
  }

  return newState;
}
```

**Step 4: Commit**

```bash
git add src/components/linesEditor/linesEditor.store.js
git commit -m "feat: add helper functions for change detection"
```

---

## Task 2: Update selectViewData to Compute Changes

**Files:**
- Modify: `src/components/linesEditor/linesEditor.store.js:61-240`

**Step 1: Replace selectViewData function**

Replace the entire `selectViewData` function (from line 61 to line 240, before the closing brace) with:

```javascript
export const selectViewData = ({ state, props }) => {
  // Track running presentation state
  let runningPresentationState = {};

  const lines = (props.lines || []).map((line, i) => {
    const isSelected = props.selectedLineId === line.id;
    const isBlockMode = state.mode === "block";

    // State before this line
    const prevState = { ...runningPresentationState };

    // Apply this line's actions
    runningPresentationState = applyActionsToState(
      runningPresentationState,
      line.actions || {},
    );

    // Compute changes
    const changes = computeChanges(
      prevState,
      runningPresentationState,
      state.repositoryState,
    );

    // Dialogue character icon
    let characterFileId;
    if (line.actions?.dialogue?.characterId) {
      const characters = toFlatItems(state.repositoryState.characters || []);
      const character = characters.find((c) => c.id === line.actions.dialogue.characterId);
      if (character && character.fileId) {
        characterFileId = character.fileId;
      }
    }

    let sectionTransition;
    let transitionTarget;
    let hasChoices;
    let choices;
    let hasSfx = false;

    // Section transitions
    const sectionTransitionData = line.actions?.sectionTransition || line.actions?.actions?.sectionTransition;
    if (sectionTransitionData) {
      if (sectionTransitionData.sceneId) {
        sectionTransition = true;
        const allScenes = toFlatItems(state.repositoryState.scenes || []);
        const targetScene = allScenes.find((scene) => scene.id === sectionTransitionData.sceneId);
        transitionTarget = targetScene?.name || "Unknown Scene";
      } else if (sectionTransitionData.sectionId) {
        sectionTransition = true;
        const allScenes = toFlatItems(state.repositoryState.scenes || []);
        let sectionName = "Unknown Section";
        for (const scene of allScenes) {
          if (scene.sections) {
            const sections = toFlatItems(scene.sections);
            const targetSection = sections.find((section) => section.id === sectionTransitionData.sectionId);
            if (targetSection) {
              sectionName = targetSection.name || sectionName;
              break;
            }
          }
        }
        transitionTarget = sectionName;
      }
    }

    // Choices
    const choicesData = line.actions?.choice || line.actions?.actions?.choice;
    if (choicesData && choicesData.items && choicesData.items.length > 0) {
      hasChoices = true;
      choices = choicesData.items;
    }

    // SFX
    if (line.actions?.sfx?.items && line.actions.sfx.items.length > 0) {
      hasSfx = true;
    }

    return {
      ...line,
      lineNumber: i + 1,
      lineColor: isSelected ? "fg" : "mu-fg",
      backgroundColor: isSelected && isBlockMode ? "var(--muted)" : "transparent",
      characterFileId,
      changes,
      sectionTransition,
      transitionTarget,
      hasChoices,
      choices,
      hasSfx,
    };
  });

  return {
    lines,
    selectedLineId: props.selectedLineId,
    mode: state.mode,
    ready: state.ready,
  };
};
```

**Step 2: Commit**

```bash
git add src/components/linesEditor/linesEditor.store.js
git commit -m "feat: compute changes in selectViewData"
```

---

## Task 3: Update View Template

**Files:**
- Modify: `src/components/linesEditor/linesEditor.view.yaml:87-109`

**Step 1: Replace preview section with change-based display**

Replace lines 87-109 (from `- rtgl-view d=h:` to end of file) with:

```yaml
                      - rtgl-view d=h:
                          # Background
                          - $if line.changes.background:
                              - $if line.changes.background.type === 'deleted':
                                  - 'rtgl-view#preview-background data-type="background" data-id="${line.id}" pos=rel d=v':
                                      - $if line.changes.background.fileId:
                                          - rvn-file-image w=36 h=24 fileId=${line.changes.background.fileId} mr=sm:
                                        $else:
                                          - rtgl-svg svg=image wh=24:
                                      - 'rtgl-svg svg="x-close" wh=14 pos=abs cor=c':
                                $else:
                                  - rtgl-view#preview-background data-type="background" data-id="${line.id}" d=h:
                                      - $if line.changes.background.fileId:
                                          - rvn-file-image w=36 h=24 fileId=${line.changes.background.fileId} mr=sm:
                                        $else:
                                          - rtgl-svg svg=image wh=24:

                          # Characters added
                          - $if line.changes.characters.added.length > 0:
                              - rtgl-view#preview-character data-type="character" data-id="${line.id}" d=h mr=sm:
                                  - $for sprite in line.changes.characters.added:
                                      - rvn-file-image fileId=${sprite.fileId} w=20 h=24 br=f:

                          # Characters updated
                          - $if line.changes.characters.updated.length > 0:
                              - rtgl-view#preview-character data-type="character" data-id="${line.id}" d=h mr=sm:
                                  - $for sprite in line.changes.characters.updated:
                                      - rvn-file-image fileId=${sprite.fileId} w=20 h=24 br=f:

                          # Characters deleted
                          - $if line.changes.characters.deleted.length > 0:
                              - 'rtgl-view#preview-character data-type="character" data-id="${line.id}" d=h mr=sm pos=rel':
                                  - $for sprite in line.changes.characters.deleted:
                                      - rtgl-view d=v pos=rel:
                                          - rvn-file-image fileId=${sprite.fileId} w=20 h=24 br=f:
                                          - 'rtgl-svg svg="x-close" wh=14 pos=abs cor=c':

                          # Dialogue
                          - $if line.changes.dialogue:
                              - $if line.changes.dialogue.type === 'deleted':
                                  - 'rtgl-view pos=rel d=v':
                                      - rtgl-svg#preview-dialogue data-type="dialogue" data-id="${line.id}" svg="dialogue" wh=24 mr=sm:
                                      - 'rtgl-svg svg="x-close" wh=14 pos=abs cor=c':
                                $else:
                                  - rtgl-svg#preview-dialogue data-type="dialogue" data-id="${line.id}" svg="dialogue" wh=24 mr=sm:

                          # Base
                          - $if line.changes.base:
                              - $if line.changes.base.type === 'deleted':
                                  - 'rtgl-view pos=rel d=v':
                                      - rtgl-svg#preview-base data-type="base" data-id="${line.id}" svg="screen" wh=24 mr=sm:
                                      - 'rtgl-svg svg="x-close" wh=14 pos=abs cor=c':
                                $else:
                                  - rtgl-svg#preview-base data-type="base" data-id="${line.id}" svg="screen" wh=24 mr=sm:

                          # BGM
                          - $if line.changes.bgm:
                              - $if line.changes.bgm.type === 'deleted':
                                  - 'rtgl-view pos=rel d=v':
                                      - rtgl-svg#preview-bgm data-type="bgm" data-id="${line.id}" svg="music" wh=24 mr=sm:
                                      - 'rtgl-svg svg="x-close" wh=14 pos=abs cor=c':
                                $else:
                                  - rtgl-svg#preview-bgm data-type="bgm" data-id="${line.id}" svg="music" wh=24 mr=sm:

                          # SFX (always show, no change detection)
                          - $if line.hasSfx:
                              - rtgl-svg#preview-sfx data-type="sfx" data-id="${line.id}" svg="audio" wh=24:
```

**Step 2: Commit**

```bash
git add src/components/linesEditor/linesEditor.view.yaml
git commit -m "feat: show changes with delete indicators in view"
```

---

## Task 4: Build and Test

**Step 1: Build the project**

Run: `bun run build`
Expected: Build succeeds

**Step 2: Manual test scenarios**

1. Add character on line 1 → sprite shows on line 1
2. Lines 2-4 → no character sprite
3. Delete character on line 5 → sprite with "x" shows on line 5

4. Add background on line 1 → image shows
5. Change background on line 3 → new image shows
6. Delete background on line 5 → old image with "x" shows

---

## Task 5: Clean Up

**Files:**
- Modify: `src/components/linesEditor/linesEditor.store.js`

**Step 1: Remove debug console.log**

Find and remove: `console.log("Lines: ", lines);`

**Step 2: Commit**

```bash
git add src/components/linesEditor/linesEditor.store.js
git commit -m "chore: remove debug log"
```

---

## Notes

- **Position shortcuts:** `pos=rel` (relative), `pos=abs` (absolute), `cor=c` (center)
- **Quoted lines:** Lines with `style=` and colons are wrapped in single quotes
- **x-close icon:** Already exists in `static/public/rtgl-icons.js`
- **SFX:** No change detection per requirements (sounds have no visual sprites)