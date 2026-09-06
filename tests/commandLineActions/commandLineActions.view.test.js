import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("commandLineActions view", () => {
  it("keeps action chooser rows constrained to the available width", () => {
    const commandLineActionsView = readFileSync(
      new URL(
        "../../src/components/commandLineActions/commandLineActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );
    const commandLineSystemActionsView = readFileSync(
      new URL(
        "../../src/components/commandLineSystemActions/commandLineSystemActions.view.yaml",
        import.meta.url,
      ),
      "utf8",
    );

    for (const view of [commandLineActionsView, commandLineSystemActionsView]) {
      expect(view).toContain("box-sizing: border-box; overflow: hidden;");
      expect(view).toContain('style="min-width: 0; box-sizing: border-box;"');
      expect(view).toContain("rtgl-text s=sm w=1fg ellipsis=true");
    }
    expect(commandLineActionsView).toContain(
      'rtgl-view h=240 aria-hidden=true style="flex: 0 0 240px;"',
    );
    expect(commandLineActionsView).toContain(
      "rtgl-view w=f h=24 av=c ph=md mb=md:\n          - rtgl-breadcrumb :items=${breadcrumb}: null",
    );
    expect(commandLineActionsView).toContain("w=f d=v g=sm ph=md");
    expect(commandLineActionsView).toContain("w=f h=f pv=md");
    expect(commandLineActionsView).not.toContain(
      "rtgl-text s=sm c=mu-fg: Actions",
    );
  });
});
