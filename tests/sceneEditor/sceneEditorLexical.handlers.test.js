import { describe, expect, it, vi } from "vitest";
import {
  handleActionsDialogClose,
  handleCommandLineSubmit,
} from "../../src/components/sceneEditorLexical/sceneEditorLexical.handlers.js";

describe("sceneEditorLexical.handlers actions dialog", () => {
  it("clears temporary presentation state and refreshes the canvas when the actions dialog closes", () => {
    const store = {
      selectActionTargetLineId: vi.fn(() => "line-2"),
      setSelectedLineId: vi.fn(),
      clearActionTargetLineId: vi.fn(),
      clearTemporaryPresentationState: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
    };

    handleActionsDialogClose(deps);

    expect(store.setSelectedLineId).toHaveBeenCalledWith({
      selectedLineId: "line-2",
    });
    expect(store.clearActionTargetLineId).toHaveBeenCalledTimes(1);
    expect(store.clearTemporaryPresentationState).toHaveBeenCalledTimes(1);
    expect(deps.render).toHaveBeenCalledTimes(1);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
        skipAnimations: true,
      },
    );
  });

  it("clears temporary presentation state and refreshes the canvas when action save fails", async () => {
    const saveError = new Error("save failed");
    const store = {
      selectActionTargetLineId: vi.fn(() => "line-2"),
      selectSelectedLineId: vi.fn(() => "line-1"),
      selectDraftSection: vi.fn(() => undefined),
      setSelectedLineId: vi.fn(),
      clearTemporaryPresentationState: vi.fn(),
    };
    const deps = {
      store,
      render: vi.fn(),
      subject: {
        dispatch: vi.fn(),
      },
      projectService: {
        updateLineActions: vi.fn(async () => {
          throw saveError;
        }),
      },
      appService: {
        showAlert: vi.fn(),
      },
    };

    await expect(
      handleCommandLineSubmit(deps, {
        _event: {
          detail: {
            background: {
              resourceId: "bg-school",
            },
          },
        },
      }),
    ).rejects.toThrow("save failed");

    expect(store.setSelectedLineId).toHaveBeenCalledWith({
      selectedLineId: "line-2",
    });
    expect(store.clearTemporaryPresentationState).toHaveBeenCalledTimes(1);
    expect(deps.subject.dispatch).toHaveBeenCalledWith(
      "sceneEditor.renderCanvas",
      {
        skipRender: true,
        skipAnimations: true,
      },
    );
  });
});
