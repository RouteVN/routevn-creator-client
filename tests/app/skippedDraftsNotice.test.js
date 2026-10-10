import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import {
  createSkippedDraftsNoticeStream,
  getNotifiedSkippedDraftsConfigKey,
  notifySkippedDrafts,
} from "../../src/pages/app/support/skippedDraftsNotice.js";

const projectId = "project-1";
const configKey = getNotifiedSkippedDraftsConfigKey(projectId);
const locales = yaml.load(readFileSync("rettangoli.config.yaml", "utf8")).fe
  .i18n.locales;
const loadI18n = (locale) =>
  yaml.load(readFileSync(`src/i18n/${locale}.yaml`, "utf8"));

const repositoryState = {
  scenes: {
    items: {
      "scene-1": {
        id: "scene-1",
        type: "scene",
        name: "Scene One",
        sections: {
          items: {
            "section-1": { id: "section-1", name: "Section One" },
            "section-2": { id: "section-2", name: "Section Two" },
          },
          tree: [{ id: "section-1" }, { id: "section-2" }],
        },
      },
    },
    tree: [{ id: "scene-1" }],
  },
};

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

const createDeps = ({ locale = "en", userConfig = {} } = {}) => {
  const config = new Map(Object.entries(userConfig));
  return {
    config,
    i18n: loadI18n(locale),
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
      getRepositoryState: vi.fn(() => structuredClone(repositoryState)),
      subscribeSkippedDrafts: vi.fn(),
    },
  };
};

describe("skippedDraftsNotice", () => {
  it("shows one alert naming each affected section and scene", async () => {
    const deps = createDeps();

    await notifySkippedDrafts(deps, {
      projectId,
      skippedDrafts: [
        createSkippedDraft({ draftId: "draft-1", type: "image.update" }),
        createSkippedDraft({
          draftId: "draft-2",
          sceneId: "scene-1",
          sectionId: "section-2",
        }),
        createSkippedDraft({
          draftId: "draft-3",
          sceneId: "scene-1",
          sectionId: "section-2",
        }),
        createSkippedDraft({
          draftId: "draft-4",
          type: "scene.update",
          sceneId: "scene-1",
        }),
        // Its scene is no longer in the project, so it cannot be named.
        createSkippedDraft({ draftId: "draft-5" }),
      ],
    });

    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    const [{ title, message }] =
      deps.appService.showAlertWhenIdle.mock.calls[0];
    expect(title).toBe("Error");
    expect(message).toBe(
      [
        "Some of your changes could not be loaded and are missing from the project:",
        "• Section “Section Two” in scene “Scene One”",
        "• Scene “Scene One”",
        "• A scene that is no longer in the project",
        "• Parts of the project outside scenes",
        "",
        "Check them and enter any missing changes again.",
        "",
        "Details:",
        `SkippedLocalDraftsError: ${[
          "image.update",
          "line.update_actions",
          "line.update_actions",
          "scene.update",
          "line.update_actions",
        ]
          .map((type) => `${type}: payload.unsupportedField is not allowed`)
          .join("; ")
          .slice(0, 275)}…`,
      ].join("\n"),
    );
    expect(deps.appService.reportError).toHaveBeenCalledOnce();
    expect(deps.appService.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "SkippedLocalDraftsError" }),
      {
        operation: "projectHistory.loadDrafts",
        code: "payload_validation_failed",
      },
    );
    expect(deps.config.get(configKey)).toEqual([
      "draft-1",
      "draft-2",
      "draft-3",
      "draft-4",
      "draft-5",
    ]);
  });

  it("tells the user about each left-out draft once across loads", async () => {
    const deps = createDeps();
    const firstDraft = createSkippedDraft({
      draftId: "draft-1",
      sceneId: "scene-1",
      sectionId: "section-1",
    });

    await notifySkippedDrafts(deps, {
      projectId,
      skippedDrafts: [firstDraft],
    });
    await notifySkippedDrafts(deps, {
      projectId,
      skippedDrafts: [firstDraft],
    });

    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledOnce();
    expect(deps.appService.reportError).toHaveBeenCalledOnce();

    await notifySkippedDrafts(deps, {
      projectId,
      skippedDrafts: [
        firstDraft,
        createSkippedDraft({
          draftId: "draft-2",
          sceneId: "scene-1",
          sectionId: "section-2",
        }),
      ],
    });

    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledTimes(2);
    const [{ message }] = deps.appService.showAlertWhenIdle.mock.calls[1];
    expect(message).toContain("Section “Section Two”");
    expect(message).not.toContain("Section “Section One”");
    expect(deps.config.get(configKey)).toEqual(["draft-1", "draft-2"]);
  });

  it("keeps only the ids of drafts that are still left out", async () => {
    const deps = createDeps({
      userConfig: { [configKey]: ["draft-1", "draft-2"] },
    });

    await notifySkippedDrafts(deps, {
      projectId,
      skippedDrafts: [createSkippedDraft({ draftId: "draft-2" })],
    });

    expect(deps.appService.showAlertWhenIdle).not.toHaveBeenCalled();
    expect(deps.config.get(configKey)).toEqual(["draft-2"]);

    await notifySkippedDrafts(deps, { projectId, skippedDrafts: [] });

    expect(deps.config.has(configKey)).toBe(false);
    expect(deps.appService.setUserConfig).toHaveBeenLastCalledWith(
      configKey,
      undefined,
    );
  });

  it("reports an error that kept cached state from being rebuilt", async () => {
    const deps = createDeps({
      userConfig: { [configKey]: ["draft-1"] },
    });
    const rebuildError = new Error("disk I/O error");

    await notifySkippedDrafts(deps, {
      projectId,
      skippedDrafts: [createSkippedDraft({ draftId: "draft-1" })],
      rebuildError,
    });

    expect(deps.appService.reportError).toHaveBeenCalledOnce();
    expect(deps.appService.reportError).toHaveBeenCalledWith(rebuildError, {
      operation: "projectHistory.rebuildWithoutSkippedDrafts",
    });
    // The project no longer uses the stale state, so there is no alert.
    expect(deps.appService.showAlertWhenIdle).not.toHaveBeenCalled();
  });

  it.each(locales)("uses the %s wording", async (locale) => {
    const deps = createDeps({ locale });
    const copy = deps.i18n.sceneEditorPage;

    await notifySkippedDrafts(deps, {
      projectId,
      skippedDrafts: [
        createSkippedDraft({
          draftId: "draft-1",
          sceneId: "scene-1",
          sectionId: "section-1",
        }),
        createSkippedDraft({ draftId: "draft-2", type: "scene.update" }),
        createSkippedDraft({ draftId: "draft-3", type: "image.update" }),
      ],
    });

    const [{ title, message }] =
      deps.appService.showAlertWhenIdle.mock.calls[0];
    const locations = [
      copy.changesNotLoadedSection
        .replace("{sceneName}", "Scene One")
        .replace("{sectionName}", "Section One"),
      copy.changesNotLoadedMissingScene,
      copy.changesNotLoadedOutsideScenes,
    ]
      .map((location) => `• ${location}`)
      .join("\n");
    expect(title).toBe(deps.i18n.resourcePages.errorTitle);
    expect(message).toContain(
      copy.changesNotLoaded.replace("{locations}", locations),
    );
    expect(message).toContain(`\n\n${copy.errorDetailsLabel}\n`);
  });

  it("follows the open project and notifies each left-out draft", async () => {
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
    const subscription = createSkippedDraftsNoticeStream({
      deps,
      projectId$,
    }).subscribe();

    const skippedDrafts = [
      createSkippedDraft({
        draftId: "draft-1",
        sceneId: "scene-1",
        sectionId: "section-1",
      }),
    ];

    projectId$.next(projectId);
    expect(listeners).toHaveLength(1);
    expect(listeners[0].options).toEqual({ projectId });

    listeners[0].listener({ projectId, skippedDrafts });
    await vi.waitFor(() =>
      expect(deps.config.get(configKey)).toEqual(["draft-1"]),
    );
    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledOnce();

    // Another route of the same project follows its current repository, and
    // drafts the user was told about are not shown again.
    projectId$.next(projectId);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(listeners).toHaveLength(2);
    listeners[1].listener({ projectId, skippedDrafts });
    await Promise.resolve();
    expect(deps.appService.showAlertWhenIdle).toHaveBeenCalledOnce();

    projectId$.next(undefined);
    expect(unsubscribe).toHaveBeenCalledTimes(2);

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
    const subscription = createSkippedDraftsNoticeStream({
      deps,
      projectId$,
    }).subscribe();

    projectId$.next(projectId);
    projectId$.next("project-2");

    expect(deps.appService.reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Repository not initialized" }),
      { operation: "projectHistory.notifySkippedDrafts" },
    );
    expect(deps.projectService.subscribeSkippedDrafts).toHaveBeenCalledTimes(2);

    subscription.unsubscribe();
  });
});
