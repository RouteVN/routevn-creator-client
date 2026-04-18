import { describe, expect, it } from "vitest";
import {
  applySceneEditorSessionTextChange,
  createSceneEditorSession,
  overlaySceneWithEditorSession,
  reconcileSceneEditorSession,
} from "../../src/internal/ui/sceneEditor/editorSession.js";

const createLine = (text) => ({
  id: "line-1",
  sectionId: "section-1",
  actions: {
    dialogue: {
      content: [{ text }],
    },
  },
});

const createSection = (text, lines = [createLine(text)]) => ({
  id: "section-1",
  lines,
});

const createScene = (section) => ({
  id: "scene-1",
  sections: [section],
});

describe("sceneEditor editorSession conflicts", () => {
  it("marks a conflict when repository text diverges from a dirty local draft", () => {
    const initialSection = createSection("base");
    const session = applySceneEditorSessionTextChange(
      createSceneEditorSession({
        sceneId: "scene-1",
        sectionId: "section-1",
        section: initialSection,
        revision: 1,
      }),
      {
        lineId: "line-1",
        content: "local draft",
      },
    );

    const nextSession = reconcileSceneEditorSession({
      session,
      sceneId: "scene-1",
      sectionId: "section-1",
      section: createSection("remote update"),
      revision: 2,
    });

    const overlaidScene = overlaySceneWithEditorSession(
      createScene(createSection("remote update")),
      nextSession,
    );

    expect(
      overlaidScene.sections[0].lines[0].actions.dialogue.content[0].text,
    ).toBe("local draft");
    expect(overlaidScene.sections[0].lines[0].hasDraftConflict).toBe(true);
    expect(overlaidScene.sections[0].lines[0].isDraftDirty).toBe(true);
  });

  it("marks a conflict when structure-dirty rebasing sees remote text divergence", () => {
    const initialSection = createSection("base", [
      createLine("base"),
      {
        id: "line-2",
        sectionId: "section-1",
        actions: {
          dialogue: {
            content: [{ text: "second" }],
          },
        },
      },
    ]);
    const session = applySceneEditorSessionTextChange(
      createSceneEditorSession({
        sceneId: "scene-1",
        sectionId: "section-1",
        section: initialSection,
        revision: 1,
      }),
      {
        lineId: "line-1",
        content: "local draft",
      },
    );
    session.structureDirty = true;

    const nextSession = reconcileSceneEditorSession({
      session,
      sceneId: "scene-1",
      sectionId: "section-1",
      section: createSection("remote update", [createLine("remote update")]),
      revision: 2,
    });

    const overlaidScene = overlaySceneWithEditorSession(
      createScene(
        createSection("remote update", [createLine("remote update")]),
      ),
      nextSession,
    );

    expect(
      overlaidScene.sections[0].lines[0].actions.dialogue.content[0].text,
    ).toBe("local draft");
    expect(overlaidScene.sections[0].lines[0].hasDraftConflict).toBe(true);
    expect(overlaidScene.sections[0].lines[0].isDraftDirty).toBe(true);
  });
});
