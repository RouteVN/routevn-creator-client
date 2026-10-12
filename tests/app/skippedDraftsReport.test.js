import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  createSkippedDraftsReportStream,
  getReportedSkippedDraftsConfigKey,
  reportSkippedDrafts,
} from "../../src/pages/app/support/skippedDraftsReport.js";

const projectId = "project-1";
const configKey = getReportedSkippedDraftsConfigKey(projectId);

const createSkippedDraft = ({
  draftId,
  type = "line.update_actions",
  sceneId,
  sectionId,
}) => ({
  draftId,
  type,
  partition: "m",
  sceneId,
  sectionId,
  error: {
    code: "payload_validation_failed",
    message: "payload.unsupportedField is not allowed",
  },
});

const createDeps = ({ userConfig = {} } = {}) => {
  const config = new Map(Object.entries(userConfig));
  return {
    config,
    appService: {
      getUserConfig: vi.fn((key) => config.get(key)),
      setUserConfig: vi.fn((key, value) => {
        if (value === undefined) {
          config.delete(key);
        } else {
          config.set(key, value);
        }
      }),
      reportError: vi.fn(),
      showAlertWhenIdle: vi.fn(async () => {}),
    },
    projectService: {
      subscribeSkippedDrafts: vi.fn(),
    },
  };
};

describe("skippedDraftsReport", () => {
  it("reports the left-out drafts as one error without an alert", () => {
    const deps = createDeps();

    reportSkippedDrafts(deps, {
      projectId,
      skippedDrafts: [
        createSkippedDraft({ draftId: "draft-1", type: "image.update" }),
        createSkippedDraft({
          draftId: "draft-2",
          sceneId: "scene-1",
          sectionId: "section-2",
        }),
        createSkippedDraft({ draftId: "draft-3", type: "scene.update" }),
      ],
    });

    expect(deps.appService.reportError).toHaveBeenCalledOnce();
    const [error, context] = deps.appService.reportError.mock.calls[0];
    expect(error.name).toBe("SkippedLocalDraftsError");
    expect(error.message).toBe(
      ["image.update", "line.update_actions", "scene.update"]
        .map((type) => `${type}: payload.unsupportedField is not allowed`)
        .join("; "),
    );
    expect(context).toEqual({
      operation: "projectHistory.loadDrafts",
      code: "payload_validation_failed",
    });
    expect(deps.appService.showAlertWhenIdle).not.toHaveBeenCalled();
    expect(deps.config.get(configKey)).toEqual([
      "draft-1",
      "draft-2",
      "draft-3",
    ]);
  });

  it("reports each left-out draft once across loads", () => {
    const deps = createDeps();
    const firstDraft = createSkippedDraft({ draftId: "draft-1" });

    reportSkippedDrafts(deps, { projectId, skippedDrafts: [firstDraft] });
    reportSkippedDrafts(deps, { projectId, skippedDrafts: [firstDraft] });

    expect(deps.appService.reportError).toHaveBeenCalledOnce();

    reportSkippedDrafts(deps, {
      projectId,
      skippedDrafts: [
        firstDraft,
        createSkippedDraft({ draftId: "draft-2", type: "scene.update" }),
      ],
    });

    expect(deps.appService.reportError).toHaveBeenCalledTimes(2);
    expect(deps.appService.reportError.mock.calls[1][0].message).toBe(
      "scene.update: payload.unsupportedField is not allowed",
    );
    expect(deps.config.get(configKey)).toEqual(["draft-1", "draft-2"]);
  });

  it("keeps only the ids of drafts that are still left out", () => {
    const deps = createDeps({
      userConfig: { [configKey]: ["draft-1", "draft-2"] },
    });

    reportSkippedDrafts(deps, {
      projectId,
      skippedDrafts: [createSkippedDraft({ draftId: "draft-2" })],
    });

    expect(deps.appService.reportError).not.toHaveBeenCalled();
    expect(deps.config.get(configKey)).toEqual(["draft-2"]);

    reportSkippedDrafts(deps, { projectId, skippedDrafts: [] });

    expect(deps.config.has(configKey)).toBe(false);
    expect(deps.appService.setUserConfig).toHaveBeenLastCalledWith(
      configKey,
      undefined,
    );
  });

  it("reports an error that kept cached state from being rebuilt", () => {
    const deps = createDeps({
      userConfig: { [configKey]: ["draft-1"] },
    });
    const rebuildError = new Error("disk I/O error");

    reportSkippedDrafts(deps, {
      projectId,
      skippedDrafts: [createSkippedDraft({ draftId: "draft-1" })],
      rebuildError,
    });

    expect(deps.appService.reportError).toHaveBeenCalledOnce();
    expect(deps.appService.reportError).toHaveBeenCalledWith(rebuildError, {
      operation: "projectHistory.rebuildWithoutSkippedDrafts",
    });
  });

  it("follows the open project and reports each left-out draft", () => {
    const deps = createDeps();
    const listeners = [];
    const unsubscribe = vi.fn();
    deps.projectService.subscribeSkippedDrafts.mockImplementation(
      (listener, options) => {
        listeners.push({ listener, options });
        return unsubscribe;
      },
    );
    const projectId$ = new Subject();
    const subscription = createSkippedDraftsReportStream({
      deps,
      projectId$,
    }).subscribe();

    const skippedDrafts = [createSkippedDraft({ draftId: "draft-1" })];

    projectId$.next(projectId);
    expect(listeners).toHaveLength(1);
    expect(listeners[0].options).toEqual({ projectId });

    listeners[0].listener({ projectId, skippedDrafts });
    expect(deps.config.get(configKey)).toEqual(["draft-1"]);
    expect(deps.appService.reportError).toHaveBeenCalledOnce();

    // Another route of the same project follows its current repository, and
    // drafts already reported are not reported again.
    projectId$.next(projectId);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(2);
    listeners[1].listener({ projectId, skippedDrafts });
    expect(deps.appService.reportError).toHaveBeenCalledOnce();

    projectId$.next(undefined);
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    expect(deps.appService.showAlertWhenIdle).not.toHaveBeenCalled();

    subscription.unsubscribe();
  });

  it("keeps reporting after one report fails", () => {
    const deps = createDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const listeners = [];
    deps.projectService.subscribeSkippedDrafts.mockImplementation(
      (listener) => {
        listeners.push(listener);
        return () => {};
      },
    );
    deps.appService.getUserConfig.mockImplementationOnce(() => {
      throw new Error("user config unavailable");
    });
    const projectId$ = new Subject();
    const subscription = createSkippedDraftsReportStream({
      deps,
      projectId$,
    }).subscribe();

    projectId$.next(projectId);
    listeners[0]({
      projectId,
      skippedDrafts: [createSkippedDraft({ draftId: "draft-1" })],
    });
    listeners[0]({
      projectId,
      skippedDrafts: [createSkippedDraft({ draftId: "draft-1" })],
    });

    expect(deps.appService.reportError).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ message: "user config unavailable" }),
      { operation: "projectHistory.reportSkippedDrafts" },
    );
    expect(deps.appService.reportError).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: "SkippedLocalDraftsError" }),
      {
        operation: "projectHistory.loadDrafts",
        code: "payload_validation_failed",
      },
    );
    expect(deps.config.get(configKey)).toEqual(["draft-1"]);

    subscription.unsubscribe();
  });

  it("reports a project that cannot be followed and keeps following others", () => {
    const deps = createDeps();
    vi.spyOn(console, "error").mockImplementation(() => {});
    deps.projectService.subscribeSkippedDrafts
      .mockImplementationOnce(() => {
        throw new Error("Repository not initialized");
      })
      .mockImplementationOnce(() => () => {});
    const projectId$ = new Subject();
    const subscription = createSkippedDraftsReportStream({
      deps,
      projectId$,
    }).subscribe();

    projectId$.next(projectId);
    projectId$.next("project-2");

    expect(deps.appService.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Repository not initialized" }),
      { operation: "projectHistory.reportSkippedDrafts" },
    );
    expect(deps.projectService.subscribeSkippedDrafts).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
  });
});
