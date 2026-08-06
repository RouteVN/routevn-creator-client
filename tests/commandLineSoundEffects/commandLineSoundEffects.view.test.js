import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineSoundEffects view", () => {
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
