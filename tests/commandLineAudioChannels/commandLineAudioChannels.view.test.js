import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentViews = [
  [
    "BGM",
    "commandLineBgm/commandLineBgm.view.yaml",
    "#bgmChannel",
    ".bgmSoundClip",
  ],
  [
    "Voice",
    "commandLineVoice/commandLineVoice.view.yaml",
    "#voiceChannel",
    ".voiceSoundClip",
  ],
  [
    "SFX",
    "commandLineSoundEffects/commandLineSoundEffects.view.yaml",
    "#sfxChannel",
    ".sfxSoundClip",
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

  it.each(componentViews)(
    "removes the native focus treatment from %s audio clips",
    (_name, relativePath, _channelTarget, soundClass) => {
      const view = readFileSync(
        new URL(`../../src/components/${relativePath}`, import.meta.url),
        "utf8",
      );
      const focusStyleStart = view.indexOf(`  "${soundClass}:focus-visible":`);
      const focusStyles = view.slice(
        focusStyleStart,
        view.indexOf('\n  "', focusStyleStart + 3),
      );

      expect(focusStyleStart).toBeGreaterThan(-1);
      expect(focusStyles).toContain("box-shadow: none");
      expect(focusStyles).toContain("outline: none");
    },
  );
});
