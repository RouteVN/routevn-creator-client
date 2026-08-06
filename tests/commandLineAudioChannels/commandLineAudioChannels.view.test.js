import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentViews = [
  ["BGM", "commandLineBgm/commandLineBgm.view.yaml", "#bgmChannel"],
  ["Voice", "commandLineVoice/commandLineVoice.view.yaml", "#voiceChannel"],
  [
    "SFX",
    "commandLineSoundEffects/commandLineSoundEffects.view.yaml",
    "#sfxChannel",
  ],
];

describe("command-line audio channel views", () => {
  it.each(componentViews)(
    "keeps %s sound controls inside the channel editor",
    (_name, relativePath, channelTarget) => {
      const view = readFileSync(
        new URL(`../../src/components/${relativePath}`, import.meta.url),
        "utf8",
      );
      const templateStart = view.indexOf("template:");
      const editorStart = view.indexOf(
        "  - rtgl-dialog#channelEditorDialog",
        templateStart,
      );
      const mainView = view.slice(templateStart, editorStart);
      const editorView = view.slice(editorStart);

      expect(mainView).toContain("#channelForm");
      expect(mainView).toContain(channelTarget);
      expect(mainView).toContain("cur=pointer");
      expect(mainView).toContain("#channelPreviewSound");
      expect(mainView).not.toContain("#editChannelButton");
      expect(mainView).not.toContain("#soundClip");
      expect(mainView).not.toContain("#emptyAddButton");
      expect(mainView).not.toContain("#insertBeforeButton");

      expect(editorView).toContain("#soundForm");
      expect(editorView).toContain("#soundClip");
      expect(editorView).toContain("#emptyAddButton");
      expect(editorView).toContain("#insertBeforeButton");
      expect(editorView).not.toContain("#channelForm");
    },
  );
});
