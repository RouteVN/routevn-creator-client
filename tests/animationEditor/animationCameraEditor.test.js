import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { JSDOM } from "jsdom";
import * as cameraEditor from "../../src/components/animationCameraEditor/animationCameraEditor.store.js";
import {
  handleApplyValue,
  handleEditValue,
  handleValueKeyDown,
  handleValueEditorPositioned,
  handleZoomIn,
  handleZoomOut,
} from "../../src/components/animationCameraEditor/animationCameraEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

describe("Camera manual values", () => {
  let state;
  let props;
  let viewport;
  let deps;
  let dom;
  const view = () =>
    cameraEditor.selectViewData({ state, props, i18n: EN_I18N });
  const edit = (field, value) => {
    deps.store.openValueEditor({ field, x: 100, y: 500 });
    deps.store.setEditorValue({ value });
    handleApplyValue(deps);
  };

  beforeAll(async () => {
    dom = new JSDOM();
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("CustomEvent", dom.window.CustomEvent);
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    const { CameraViewportElement } = await import(
      "../../src/primitives/cameraViewport.js"
    );
    dom.window.customElements.define(
      "test-camera-value-viewport",
      CameraViewportElement,
    );
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    state = cameraEditor.createInitialState();
    props = {
      pose: {
        x: 960.123456,
        y: 540.654321,
        scaleX: 1.123456,
        scaleY: 1.123456,
      },
      projectResolution: { width: 1920, height: 1080 },
    };
    viewport = document.createElement("test-camera-value-viewport");
    viewport.pose = props.pose;
    viewport.resolution = props.projectResolution;
    viewport.addEventListener("pose-change", (event) => {
      props.pose = event.detail.pose;
    });
    document.body.append(viewport);
    deps = {
      refs: { viewport, valueInput: { focus: vi.fn() } },
      store: Object.fromEntries(
        Object.entries(cameraEditor).map(([name, fn]) => [
          name,
          (...args) => fn({ state, props, i18n: EN_I18N }, ...args),
        ]),
      ),
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  });

  afterEach(() => {
    viewport.remove();
  });

  it.each([
    { x: 0, y: 1, scaleX: 0.1, scaleY: 0.1 },
    { x: -99999.99, y: 99999.99, scaleX: 9.9999, scaleY: 9.9999 },
  ])("keeps numeric controls fixed-width for pose %j", (pose) => {
    props.pose = pose;
    const fragment = JSDOM.fragment(
      renderViewYaml(
        "src/components/animationCameraEditor/animationCameraEditor.view.yaml",
        view(),
      ),
    );
    for (const [field, width] of [
      ["X", "120"],
      ["Y", "120"],
      ["Zoom", "96"],
    ]) {
      const control = fragment.querySelector(`#editValue${field}`);
      expect(control.getAttribute("w")).toBe(width);
      expect(control.querySelector("rtgl-button").getAttribute("w")).toBe("f");
    }
  });

  it("rounds readouts and input prefills without committing the Camera draft", () => {
    const authored = structuredClone(props.pose);
    expect(view()).toMatchObject({
      xLabel: "X 960.12",
      yLabel: "Y 540.65",
      zoomLabel: "112.35%",
    });
    const html = renderViewYaml(
      "src/components/animationCameraEditor/animationCameraEditor.view.yaml",
      view(),
    );
    for (const field of ["X", "Y", "Zoom"]) {
      expect(html).toContain(`id="editValue${field}"`);
    }
    for (const [field, expectedValue] of [
      ["x", "960.12"],
      ["y", "540.65"],
      ["zoom", "112.35"],
    ]) {
      handleEditValue(deps, {
        _event: {
          currentTarget: {
            dataset: { field },
            getBoundingClientRect: () => ({ left: 100, top: 500 }),
          },
        },
      });
      expect(state.valueEditor.value).toBe(expectedValue);
      handleApplyValue(deps);
      expect(props.pose).toEqual(authored);
    }
    expect(deps.refs.valueInput.focus).not.toHaveBeenCalled();
    handleValueEditorPositioned(deps);
    expect(deps.refs.valueInput.focus).toHaveBeenCalledOnce();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });

  it("accepts negative, fractional, and zero coordinates without changing other fields", () => {
    const initial = structuredClone(props.pose);
    edit("x", "-12.3456");
    expect(props.pose).toEqual({ ...initial, x: -12.3456 });
    deps.store.openValueEditor({ field: "x", x: 100, y: 500 });
    expect(state.valueEditor.value).toBe("-12.35");
    handleApplyValue(deps);
    expect(props.pose.x).toBe(-12.3456);
    edit("y", "0");
    expect(props.pose).toEqual({ ...initial, x: -12.3456, y: 0 });
    expect(state.valueEditor).toBeUndefined();
  });

  it("converts zoom percentages, preserves aspect ratio, and shares viewport limits", () => {
    props.pose = { x: 960, y: 540, scaleX: 1, scaleY: 2 };
    viewport.pose = props.pose;
    edit("zoom", "125.5");
    expect(props.pose).toEqual({ x: 960, y: 540, scaleX: 1.255, scaleY: 2.51 });
    edit("zoom", "2000");
    expect(props.pose.scaleX).toBeCloseTo(5);
    expect(props.pose.scaleY).toBeCloseTo(10);
    edit("zoom", "0.01");
    expect(props.pose.scaleX).toBeCloseTo(0.1);
    expect(props.pose.scaleY).toBeCloseTo(0.2);
  });

  it("uses fine zoom buttons by default and fivefold steps with Shift", () => {
    viewport.reset();
    handleZoomIn(deps, { _event: { shiftKey: false } });
    expect(view().zoomLabel).toBe("101%");
    handleZoomIn(deps, { _event: { shiftKey: true } });
    expect(view().zoomLabel).toBe("106%");
    handleZoomOut(deps, { _event: { shiftKey: false } });
    expect(view().zoomLabel).toBe("105%");
    handleZoomOut(deps, { _event: { shiftKey: true } });
    expect(view().zoomLabel).toBe("100%");
  });

  it("keeps zoom gestures precise in the temporary draft until Camera Done", () => {
    edit("zoom", "125.5");
    expect(props.pose.scaleX).toBe(1.255);
    expect(props.pose.scaleY).toBe(1.255);
    deps.store.openValueEditor({ field: "zoom", x: 100, y: 500 });
    expect(state.valueEditor.value).toBe("125.5");
    handleApplyValue(deps);
    expect(props.pose.scaleX).toBe(1.255);

    props.pose = {
      x: 960,
      y: 540,
      scaleX: 1.123456789012345,
      scaleY: 2.24691357802469,
    };
    viewport.pose = props.pose;
    const precise = structuredClone(props.pose);
    deps.store.openValueEditor({ field: "zoom", x: 100, y: 500 });
    handleApplyValue(deps);
    expect(props.pose).toEqual(precise);
  });

  it.each([
    ["x", ""],
    ["y", " "],
    ["x", "12px"],
    ["y", "Infinity"],
    ["zoom", "NaN"],
    ["zoom", "0"],
    ["zoom", "-10"],
  ])(
    "rejects invalid %s input %j without losing the editor or changing the pose",
    (field, value) => {
      const initial = structuredClone(props.pose);
      edit(field, value);
      expect(props.pose).toEqual(initial);
      expect(state.valueEditor.value).toBe(value);
      expect(view().invalidValue).toBe(true);
      const html = renderViewYaml(
        "src/components/animationCameraEditor/animationCameraEditor.view.yaml",
        view(),
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('id="applyValue"');
      expect(
        JSDOM.fragment(html)
          .querySelector("#applyValue")
          .hasAttribute("disabled"),
      ).toBe(true);
    },
  );

  it("confirms with Enter and cancels only the number entry with Escape", () => {
    const initial = structuredClone(props.pose);
    const event = {
      key: "Escape",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    deps.store.openValueEditor({ field: "x", x: 100, y: 500 });
    deps.store.setEditorValue({ value: "25.5" });
    handleValueKeyDown(deps, { _event: event });
    expect(props.pose).toEqual(initial);
    expect(state.valueEditor).toBeUndefined();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(deps.dispatchEvent).not.toHaveBeenCalled();

    deps.store.openValueEditor({ field: "x", x: 100, y: 500 });
    deps.store.setEditorValue({ value: "25.5" });
    handleValueKeyDown(deps, { _event: { ...event, key: "Enter" } });
    expect(props.pose.x).toBe(25.5);
    expect(state.valueEditor).toBeUndefined();
  });
});
