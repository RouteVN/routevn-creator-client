import { describe, expect, it, vi } from "vitest";
import * as galleryStore from "../../src/components/asset-pack-gallery/asset-pack-gallery.store.js";
import {
  handleActivateKeyDown,
  handleGalleryMouseDown,
  handleLightboxBackdrop,
  handleLightboxClose,
  handleLightboxKeyDown,
  handleLightboxOpen,
  handleOnUpdate,
  handleStep,
  handleThumbnailClick,
} from "../../src/components/asset-pack-gallery/asset-pack-gallery.handlers.js";

const images = [
  "https://files.example/shot-1.jpg",
  "https://files.example/shot-2.jpg",
  "https://files.example/shot-3.jpg",
];

// The gallery's real store, driven the way the component drives it.
const createGallery = (
  props = { packId: "pack-1", title: "Pack One", images },
) => {
  const state = galleryStore.createInitialState();
  const store = {};
  for (const [name, fn] of Object.entries(galleryStore)) {
    if (name !== "createInitialState" && name !== "selectViewData") {
      store[name] = (payload) => fn({ state }, payload);
    }
  }
  const deps = {
    store,
    props,
    render: vi.fn(),
    refs: { galleryOpen: { focus: vi.fn() } },
  };
  const view = (i18n) =>
    galleryStore.selectViewData({ state, props: deps.props, i18n });
  return { state, deps, view };
};

const fromTarget = (dataset) => ({ _event: { currentTarget: { dataset } } });

describe("asset-pack-gallery", () => {
  it("shows the first image with localized labels and dims the others", () => {
    const { view } = createGallery();

    expect(view({})).toMatchObject({
      src: images[0],
      hasMany: true,
      isOpen: false,
      position: "1 / 3",
      openLabel: "View Pack One, image 1 / 3, full screen",
      previousLabel: "Previous image",
      nextLabel: "Next image",
      dialogLabel: "Pack One images",
      imageAlt: "Pack One, image 1 / 3",
    });
    expect(view({}).images[0]).toMatchObject({
      current: "true",
      ring: "pr",
      opacity: "1",
      showLabel: "Show image 1",
    });
    expect(view({}).images[1]).toMatchObject({
      current: "false",
      ring: "tr",
      opacity: "0.7",
    });
    expect(
      view({ assetPackGallery: { nextLabel: "次の画像" } }).nextLabel,
    ).toBe("次の画像");
  });

  it("hides the arrows and thumbnails for one image", () => {
    const { view } = createGallery({
      packId: "pack-1",
      title: "Pack One",
      images: [images[0]],
    });
    expect(view({}).hasMany).toBe(false);
  });

  it("steps with the arrows, wrapping at either end, and jumps to a thumbnail", () => {
    const { state, deps } = createGallery();

    handleStep(deps, fromTarget({ step: "-1" }));
    expect(state.selectedIndex).toBe(2);
    handleStep(deps, fromTarget({ step: "1" }));
    expect(state.selectedIndex).toBe(0);
    handleThumbnailClick(deps, fromTarget({ imageIndex: "1" }));
    expect(state.selectedIndex).toBe(1);
    expect(deps.render).toHaveBeenCalledTimes(3);
  });

  it("opens full screen, steps with the arrow keys and closes back to the gallery", () => {
    const { state, deps } = createGallery();
    handleLightboxOpen(deps);
    expect(state.isOpen).toBe(true);

    const key = (name) => {
      const _event = { key: name, preventDefault: vi.fn() };
      handleLightboxKeyDown(deps, { _event });
      return _event;
    };
    expect(key("ArrowRight").preventDefault).toHaveBeenCalled();
    expect(state.selectedIndex).toBe(1);
    key("ArrowLeft");
    key("ArrowLeft");
    expect(state.selectedIndex).toBe(2);
    expect(key("Escape").preventDefault).not.toHaveBeenCalled();

    const stage = {};
    handleLightboxBackdrop(deps, {
      _event: { target: {}, currentTarget: stage },
    });
    expect(state.isOpen).toBe(true);
    handleLightboxBackdrop(deps, {
      _event: { target: stage, currentTarget: stage },
    });
    expect(state.isOpen).toBe(false);
    expect(deps.refs.galleryOpen.focus).toHaveBeenCalledTimes(1);

    handleLightboxOpen(deps);
    handleLightboxClose(deps);
    expect(state.isOpen).toBe(false);
    expect(deps.refs.galleryOpen.focus).toHaveBeenCalledTimes(2);
  });

  it("starts again at the first image, closed, for another pack", () => {
    const { state, deps } = createGallery();
    handleStep(deps, fromTarget({ step: "1" }));
    handleLightboxOpen(deps);

    handleOnUpdate(deps, {
      oldProps: { packId: "pack-1" },
      newProps: { packId: "pack-1" },
    });
    expect(state).toEqual({ selectedIndex: 1, isOpen: true });

    handleOnUpdate(deps, {
      oldProps: { packId: "pack-1" },
      newProps: { packId: "pack-2" },
    });
    expect(state).toEqual({ selectedIndex: 0, isOpen: false });
  });

  it("activates its buttons with Enter or Space", () => {
    const click = vi.fn();
    const press = (key) => {
      const _event = { key, preventDefault: vi.fn(), currentTarget: { click } };
      handleActivateKeyDown({}, { _event });
    };
    press("Enter");
    press(" ");
    press("Tab");
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("keeps repeated clicks from selecting the image", () => {
    const mouseDown = (button, detail) => {
      const _event = { button, detail, preventDefault: vi.fn() };
      handleGalleryMouseDown({}, { _event });
      return _event.preventDefault;
    };
    expect(mouseDown(0, 1)).not.toHaveBeenCalled();
    expect(mouseDown(0, 2)).toHaveBeenCalled();
    expect(mouseDown(2, 2)).not.toHaveBeenCalled();
  });
});
