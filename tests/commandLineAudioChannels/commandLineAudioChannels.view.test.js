import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentViews = [
  [
    "BGM",
    "commandLineBgm/commandLineBgm.view.yaml",
    "#bgmChannel",
    ".bgmSoundClip",
    "$if showChannelControls",
  ],
  [
    "Voice",
    "commandLineVoice/commandLineVoice.view.yaml",
    "#voiceChannel",
    ".voiceSoundClip",
    "$if showChannelControls",
  ],
  [
    "SFX",
    "commandLineSoundEffects/commandLineSoundEffects.view.yaml",
    "#sfxChannel",
    ".sfxSoundClip",
    "$if channel.showControls",
  ],
];

describe("command-line audio channel views", () => {
  it.each(componentViews)(
    "keeps %s sound controls inside the channel editor",
    (_name, relativePath, channelTarget, _soundClass, controlsCondition) => {
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
      expect(mainView).toContain(controlsCondition);
      expect(mainView).toContain(channelTarget);
      expect(mainView).toContain("cur=pointer");
      const channelView = mainView
        .split("\n")
        .find((line) => line.includes(channelTarget));
      expect(channelView).toContain("bgc=bg");
      expect(channelView).not.toContain("h-bgc=");
      expect(channelView).toContain("h-bc=${channel");
      expect(mainView).toContain("#channelPreviewSound");
      expect(mainView).not.toContain("#editChannelButton");
      expect(mainView).not.toContain("#soundClip");
      expect(mainView).not.toContain("#emptyAddButton");
      expect(mainView).not.toContain("#insertBeforeButton");

      expect(editorView).toContain("#soundForm");
      expect(editorView).toContain("#channelEditorConfirmButton v=pr");
      expect(editorView).toContain("${confirmButtonLabel}");
      expect(editorView).not.toContain("${audioLabel}");
      expect(editorView).not.toContain("${selectionHeading}");
      expect(editorView).not.toContain("${selectionName}");
      const editorChannelView = editorView
        .split("\n")
        .find((line) => line.includes("#editorChannel"));
      expect(editorChannelView).toContain("bgc=bg");
      expect(editorChannelView).not.toContain("h-bgc=");
      expect(editorChannelView).toContain("bc=bo");
      expect(editorChannelView).not.toContain("h-bc=");
      expect(editorView).toContain("#soundClip");
      expect(editorView).toContain("#emptyAddButton");
      expect(editorView).toContain("#insertBeforeButton");
      expect(editorView).not.toContain("#channelForm");
    },
  );

  it("aligns the BGM editor title with its channel card", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineBgm/commandLineBgm.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain("rtgl-view w=f ph=lg:");
    expect(view).toContain(
      "rtgl-text#channelEditorTitle s=lg: ${channelEditorTitle}",
    );
  });

  it("shows a centered plus in an empty BGM channel preview", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineBgm/commandLineBgm.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const templateStart = view.indexOf("template:");
    const editorStart = view.indexOf(
      "  - rtgl-dialog#channelEditorDialog",
      templateStart,
    );
    const mainView = view.slice(templateStart, editorStart);
    const emptyAddStyleStart = view.indexOf('  ".bgmEmptyAdd":');
    const emptyAddStyles = view.slice(
      emptyAddStyleStart,
      view.indexOf('  ".bgmEmptyAdd:hover":', emptyAddStyleStart),
    );

    expect(mainView).toContain('div.bgmEmptyAdd aria-hidden=true\': "+"');
    expect(mainView).not.toContain("${emptyAudioLabel}");
    expect(emptyAddStyles).toContain("align-items: center");
    expect(emptyAddStyles).toContain("justify-content: center");
  });

  it("shows a centered plus in an empty Voice channel preview", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineVoice/commandLineVoice.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const templateStart = view.indexOf("template:");
    const editorStart = view.indexOf(
      "  - rtgl-dialog#channelEditorDialog",
      templateStart,
    );
    const mainView = view.slice(templateStart, editorStart);
    const emptyAddStyleStart = view.indexOf('  ".voiceEmptyAdd":');
    const emptyAddStyles = view.slice(
      emptyAddStyleStart,
      view.indexOf('  ".voiceEmptyAdd:hover":', emptyAddStyleStart),
    );

    expect(mainView).toContain('div.voiceEmptyAdd aria-hidden=true\': "+"');
    expect(mainView).not.toContain("${emptyAudioLabel}");
    expect(emptyAddStyles).toContain("align-items: center");
    expect(emptyAddStyles).toContain("justify-content: center");
  });

  it("remounts audio channel forms from their state-derived keys", () => {
    const bgmView = readFileSync(
      new URL(
        "../../src/components/commandLineBgm/commandLineBgm.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const voiceView = readFileSync(
      new URL(
        "../../src/components/commandLineVoice/commandLineVoice.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const sfxView = readFileSync(
      new URL(
        "../../src/components/commandLineSoundEffects/commandLineSoundEffects.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(bgmView).toContain("rtgl-form#channelForm key=${channelFormKey}");
    expect(bgmView).not.toContain(
      "rtgl-form#channelForm key=${channelFormKey} :form=${channelForm} :defaultValues=${channelDefaultValues} p=lg",
    );
    expect(voiceView).toContain("rtgl-form#channelForm key=${channelFormKey}");
    expect(sfxView).toContain(
      'rtgl-form#channelForm${i} data-channel-id="${channel.id}" key=${channel.channelFormKey}',
    );
  });

  it.each(componentViews)(
    "shows a custom keyboard focus ring on %s channels and audio clips",
    (_name, relativePath, channelTarget, soundClass) => {
      const view = readFileSync(
        new URL(`../../src/components/${relativePath}`, import.meta.url),
        "utf8",
      );
      const channelClass = channelTarget
        .replace("#bgmChannel", ".bgmChannelPreview")
        .replace("#voiceChannel", ".voiceChannelPreview")
        .replace("#sfxChannel", ".sfxChannelPreview");

      for (const focusClass of [channelClass, soundClass]) {
        const focusStyleStart = view.indexOf(
          `  "${focusClass}:focus-visible":`,
        );
        const focusStyles = view.slice(
          focusStyleStart,
          view.indexOf('\n  "', focusStyleStart + 3),
        );

        expect(focusStyleStart).toBeGreaterThan(-1);
        expect(focusStyles).toContain(
          "box-shadow: 0 0 0 2px var(--ring) inset",
        );
        expect(focusStyles).toContain("outline: none");
      }
    },
  );
});
