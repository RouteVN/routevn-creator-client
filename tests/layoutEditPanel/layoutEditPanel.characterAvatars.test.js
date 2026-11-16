import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { handleBeforeMount } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

const createDeps = (props) => {
  const urls = new Subject();
  const store = new Proxy(
    { setSpeakerAvatarUrls: vi.fn() },
    { get: (target, name) => (target[name] ??= vi.fn()) },
  );
  const projectService = {
    subscribeProjectState: vi.fn((listener) => {
      listener({ repositoryState: { characters: { items: {}, tree: [] } } });
      return () => {};
    }),
    observeFileUrls: vi.fn(() => urls),
  };

  return {
    deps: {
      props,
      store,
      projectService,
      render: vi.fn(),
      appService: { showToast: vi.fn() },
      i18n: { charactersPage: {} },
      uiConfig: {},
    },
    urls,
  };
};

describe("layoutEditPanel character avatars", () => {
  it("loads character avatars for an element's conditions", () => {
    const { deps, urls } = createDeps({ values: {} });

    const unsubscribe = handleBeforeMount(deps);
    urls.next({ urls: { "file-1": "blob:one" }, failedFileIds: [] });

    expect(deps.store.setSpeakerAvatarUrls).toHaveBeenLastCalledWith({
      urls: { "file-1": "blob:one" },
    });
    expect(unsubscribe).toBeTypeOf("function");
    unsubscribe();
  });

  it("loads none as a transform inspector", () => {
    const { deps } = createDeps({ values: {}, mode: "transform" });

    expect(handleBeforeMount(deps)).toBeUndefined();
    expect(deps.projectService.observeFileUrls).not.toHaveBeenCalled();
  });
});
