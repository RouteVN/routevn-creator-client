import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineSoundEffects view", () => {
  it("uses the large size for the sound effect editor dialog", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineSoundEffects/commandLineSoundEffects.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    expect(view).toContain(
      "rtgl-dialog#channelEditorDialog ?open=${isChannelEditorOpen} s=lg close-button:",
    );
    expect(view).not.toContain(
      "rtgl-dialog#channelEditorDialog ?open=${isChannelEditorOpen} s=md",
    );
  });

  it("makes the whole channel the editor target", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineSoundEffects/commandLineSoundEffects.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const channelPreviewStart = view.indexOf('  ".sfxChannelPreview":');
    const channelPreviewStyles = view.slice(
      channelPreviewStart,
      view.indexOf(
        '  ".sfxChannelPreview:focus-visible":',
        channelPreviewStart,
      ),
    );

    expect(view).toContain("rtgl-view.sfxChannelHeader d=h w=f:");
    expect(view).toContain(".sfxChannel.sfxChannelPreview");
    expect(view).toContain("role=button");
    expect(channelPreviewStart).toBeGreaterThan(-1);
    expect(channelPreviewStyles).toContain("cursor: pointer");
    expect(view).not.toContain("editChannelButton");
  });

  it("shows a plus affordance for an empty channel preview", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineSoundEffects/commandLineSoundEffects.view.yaml",
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
    const emptyAddStyleStart = view.indexOf('  ".sfxEmptyAdd":');
    const emptyAddStyles = view.slice(
      emptyAddStyleStart,
      view.indexOf('  ".sfxEmptyAdd:hover":', emptyAddStyleStart),
    );

    expect(mainView).toContain("div.sfxEmptyAdd aria-hidden=true':");
    expect(mainView).toContain('span.sfxEmptyAddIcon: "+"');
    expect(mainView).not.toContain("${emptyAudioLabel}");
    expect(emptyAddStyles).toContain("align-items: center");
    expect(emptyAddStyles).toContain('flex: "1 1 0"');
    expect(emptyAddStyles).toContain("height: auto");
    expect(emptyAddStyles).toContain("justify-content: center");
    expect(emptyAddStyles).toContain('min-height: "0"');
    expect(emptyAddStyles).not.toContain("height: 100%");

    const emptyAddIconStyleStart = view.indexOf('  ".sfxEmptyAddIcon":');
    const emptyAddIconStyles = view.slice(
      emptyAddIconStyleStart,
      view.indexOf('  ".sfxEmptyAdd:hover":', emptyAddIconStyleStart),
    );
    const channelHeaderStyleStart = view.indexOf('  ".sfxChannelHeader":');
    const channelHeaderStyles = view.slice(
      channelHeaderStyleStart,
      view.indexOf('  ".sfxChannelLabel":', channelHeaderStyleStart),
    );
    const timelineTrackStyleStart = view.indexOf('  ".sfxTimelineTrack":');
    const timelineTrackStyles = view.slice(
      timelineTrackStyleStart,
      view.indexOf('  ".sfxTimelineContent":', timelineTrackStyleStart),
    );

    expect(emptyAddIconStyles).toContain("transform: translateY(-16px)");
    expect(channelHeaderStyles).not.toContain("border-bottom");
    expect(timelineTrackStyles).toContain(
      'border-top: "1px solid var(--border)"',
    );
  });

  it("renders channel controls before the add button and bottom scroll space", () => {
    const view = readFileSync(
      new URL(
        "../../src/components/commandLineSoundEffects/commandLineSoundEffects.view.yaml",
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
    const channelFormIndex = mainView.indexOf("#channelForm${i}");
    const addChannelButtonIndex = mainView.indexOf("#addChannelButton");
    const bottomSpacerIndex = mainView.indexOf("h=240 aria-hidden=true");

    expect(mainView).toContain("$if channel.showControls");
    expect(mainView).toContain('data-channel-id="${channel.id}"');
    expect(channelFormIndex).toBeGreaterThan(-1);
    expect(addChannelButtonIndex).toBeGreaterThan(channelFormIndex);
    expect(bottomSpacerIndex).toBeGreaterThan(addChannelButtonIndex);
    expect(mainView).not.toContain("$if showChannelControls");
  });
});
