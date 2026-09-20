import { expect, it, vi } from "vitest";
import { loadAvailableLayoutEditorAssets } from "../../src/components/layoutEditorCanvas/support/layoutEditorAssetFeedback.js";
import { omitUnavailableLayoutElements } from "../../src/components/layoutEditorCanvas/support/layoutEditorCanvasRender.js";
import * as actions from "../../src/components/layoutEditorCanvas/layoutEditorCanvas.store.js";

it("warns once for all failed layout assets, retries, and recovers without changing the layout", async () => {
  const context = { state: actions.createInitialState() };
  const store = Object.fromEntries(
    Object.entries(actions).map(([name, action]) => [
      name,
      (payload) => action(context, payload),
    ]),
  );
  const repository = {
    fonts: { items: { font: { name: "Font One", fileId: "font" } } },
    images: { items: { image: { name: "Image One", fileId: "image" } } },
  };
  let broken = true;
  const deps = {
    store,
    appService: { showAlert: vi.fn() },
    projectService: {
      getRepositoryState: () => repository,
      getFileContent: vi.fn(async (id) => {
        if (broken && id === "font") throw new Error("font checksum mismatch");
        return { url: `asset://${id}` };
      }),
    },
    graphicsService: {
      hasLoadedAsset: () => false,
      loadAssets: vi.fn(async (assets) => {
        if (broken && assets.image) throw new Error("image decode failure");
      }),
    },
  };
  const references = ["font", "image", "healthy"].map((url) => ({ url }));
  for (let i = 0; i < 2; i++) {
    expect(
      await loadAvailableLayoutEditorAssets(deps, references, repository),
    ).toEqual(["font", "image"]);
  }
  expect(deps.appService.showAlert).toHaveBeenCalledOnce();
  const message = deps.appService.showAlert.mock.calls[0][0].message;
  expect(message).toContain("Fonts: Font One");
  expect(message).toContain("Images: Image One");
  const elements = [
    {
      type: "container",
      children: [
        { id: "text", type: "text", textStyle: { fontFamily: ["font"] } },
        { id: "image", type: "sprite", url: "image" },
        { id: "healthy", type: "sprite", url: "healthy" },
      ],
    },
  ];
  const before = structuredClone(elements);
  expect(
    omitUnavailableLayoutElements(elements, ["font", "image"])[0].children.map(
      ({ id }) => id,
    ),
  ).toEqual(["healthy"]);
  expect(elements).toEqual(before);
  broken = false;
  expect(
    await loadAvailableLayoutEditorAssets(deps, references, repository),
  ).toEqual([]);
  expect(deps.appService.showAlert).toHaveBeenCalledOnce();
});
