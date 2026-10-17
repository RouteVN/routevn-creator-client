import { afterEach, describe, expect, it, vi } from "vitest";
import * as actions from "../../src/components/fileImage/fileImage.store.js";
import {
  handleAfterMount,
  handleOnUpdate,
} from "../../src/components/fileImage/fileImage.handlers.js";
import { renderViewYaml } from "../support/renderView.js";

const TEMPLATE = "src/components/fileImage/fileImage.view.yaml";

const createImages = (...imageIds) => ({
  items: Object.fromEntries(
    imageIds.map((imageId) => [
      imageId,
      {
        id: imageId,
        type: "image",
        fileId: `file-${imageId}`,
        thumbnailFileId: `thumbnail-${imageId}`,
      },
    ]),
  ),
});

const setup = ({ props, imageIds = [] }) => {
  const project = { images: createImages(...imageIds) };
  const context = { state: actions.createInitialState(), props };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  const deps = {
    store,
    props: context.props,
    render: vi.fn(),
    projectService: {
      getRepositoryState: () => project,
      getFileContent: vi.fn(async (id) => ({ url: `asset://${id}` })),
      checkFileIntegrity: vi.fn(async () => ({ verified: true })),
    },
  };
  const deleteImage = (imageId) => {
    delete project.images.items[imageId];
  };
  const setProps = (nextProps) => {
    deps.props = context.props = nextProps;
    return nextProps;
  };
  return { context, deps, deleteImage, setProps };
};

const expectPlaceholder = (context) => {
  expect(context.state.src).toBe("");
  expect(context.state.hasError).toBe(false);
  expect(context.state.loadedFileId).toBeUndefined();

  const viewData = actions.selectViewData(context);
  expect(viewData.hasSrc).toBe(false);
  expect(viewData.hasError).toBe(false);

  const html = renderViewYaml(TEMPLATE, viewData);
  expect(html).not.toContain("rtgl-image");
  expect(html).not.toContain("re-upload");
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("file image with an image that is not in the project", () => {
  it("shows the placeholder when it mounts and loads nothing", async () => {
    const { context, deps } = setup({
      props: { imageId: "image-gone", source: "thumbnail" },
    });

    await expect(handleAfterMount(deps)).resolves.toBeUndefined();

    expectPlaceholder(context);
    expect(deps.projectService.getFileContent).not.toHaveBeenCalled();
  });

  it("shows the placeholder when a lazy image mounts", async () => {
    const { context, deps } = setup({
      props: { imageId: "image-gone", lazy: true },
    });

    await expect(handleAfterMount(deps)).resolves.toBeUndefined();

    expectPlaceholder(context);
    expect(deps.projectService.getFileContent).not.toHaveBeenCalled();
  });

  it("clears a shown image when its image is replaced by one that is gone", async () => {
    const blobUrl = "blob:image-one";
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const { context, deps, setProps } = setup({
      props: { imageId: "image-one", source: "thumbnail" },
      imageIds: ["image-one"],
    });
    deps.projectService.getFileContent.mockResolvedValue({ url: blobUrl });
    await handleAfterMount(deps);
    expect(context.state.src).toBe(blobUrl);

    const newProps = setProps({ imageId: "image-gone", source: "thumbnail" });
    await expect(handleOnUpdate(deps, { newProps })).resolves.toBeUndefined();

    expectPlaceholder(context);
    expect(revoke).toHaveBeenCalledWith(blobUrl);
  });

  it("loads the image once the reference points at one that exists", async () => {
    const { context, deps, setProps } = setup({
      props: { imageId: "image-gone", source: "thumbnail" },
      imageIds: ["image-one"],
    });
    await handleAfterMount(deps);
    expectPlaceholder(context);

    const newProps = setProps({ imageId: "image-one", source: "thumbnail" });
    await handleOnUpdate(deps, { newProps });

    expect(deps.projectService.getFileContent).toHaveBeenCalledWith(
      "thumbnail-image-one",
    );
    expect(context.state.src).toBe("asset://thumbnail-image-one");
  });

  it("drops a load whose image is deleted while its file is loading", async () => {
    const blobUrl = "blob:image-one";
    const revoke = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    const { context, deps, deleteImage } = setup({
      props: { imageId: "image-one", source: "thumbnail" },
      imageIds: ["image-one"],
    });
    let finishLoad;
    deps.projectService.getFileContent.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishLoad = () => resolve({ url: blobUrl });
        }),
    );

    const load = handleAfterMount(deps);
    await vi.waitFor(() => expect(finishLoad).toBeDefined());
    deleteImage("image-one");
    finishLoad();
    await expect(load).resolves.toBeUndefined();

    expect(context.state.src).toBe("");
    expect(context.state.hasError).toBe(false);
    expect(revoke).toHaveBeenCalledWith(blobUrl);
  });
});
