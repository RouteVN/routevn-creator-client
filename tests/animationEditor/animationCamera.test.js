import { describe, expect, it, vi } from "vitest";
import { produce } from "immer";
import { JSDOM } from "jsdom";
import { validatePayload } from "@routevn/creator-model";
import * as editor from "../../src/pages/animationEditor/animationEditor.store.js";
import * as timeline from "../../src/components/keyframeTimeline/keyframeTimeline.store.js";
import {
  handleAdjustCamera,
  handleAdjustInitialCamera,
  handleAdjustCameraStartValue,
  handleCameraClose,
  handleCameraDone,
  handleClosePopover,
  handleEditKeyframeFormSubmit,
  handleKeyframeClick,
  handleKeyframeDropdownItemClick,
  handleRulerTimeScrub,
  handleSelectedKeyframeAddMenuItemClick,
  handleSelectedKeyframeRemoveStartValueClick,
  handleRemoveCameraInitialValue,
} from "../../src/pages/animationEditor/animationEditor.handlers.js";
import {
  expandCameraTrack,
  groupCameraTrack,
  roundCameraPose,
} from "../../src/internal/animationCamera.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const createState = (side = "update") => {
  const state = editor.createInitialState();
  editor.openDialog(
    { state },
    { dialogType: side === "update" ? "update" : "transition" },
  );
  editor.addProperty({ state }, { side, property: "camera" });
  return state;
};
const view = (state) => editor.selectViewData({ state, i18n: EN_I18N });
const persisted = (state, side = "update") => {
  const tween = editor.selectProperties({ state }, { side });
  const animation =
    side === "update"
      ? { type: "update", tween }
      : { type: "transition", [side]: { tween } };
  return {
    type: "animation",
    name: "Camera One",
    cameraTracks: editor.selectCameraTracks({ state }),
    animation,
  };
};

describe("Camera animation authoring", () => {
  it.each(["update", "prev", "next"])(
    "keeps tiny positive %s Camera scales valid when saving unrelated timing edits",
    async (side) => {
      const state = createState(side);
      const pose = { x: -0.001, y: 0.001, scaleX: 0.001, scaleY: 0.0049 };
      const camera = state.tweenBySection[side].camera;
      camera.initialValue = pose;
      camera.keyframes[0].startValue = pose;
      camera.keyframes[0].value = pose;
      // Imported scales are valid model data even below our stored precision.
      const imported = persisted(state, side);
      const tween =
        side === "update"
          ? imported.animation.tween
          : imported.animation[side].tween;
      for (const [property, value] of Object.entries(pose)) {
        tween[property].initialValue = value;
        tween[property].keyframes[0].startValue = value;
        tween[property].keyframes[0].value = value;
      }
      const command = (data) => ({
        type: "animation.create",
        payload: { animationId: "camera-one", data },
      });
      expect(validatePayload(command(imported))).toEqual({ valid: true });
      editor.openDialog({ state }, { editMode: true, itemData: imported });
      editor.setSelectedKeyframe(
        { state },
        { side, property: "camera", index: 0 },
      );
      const authored = structuredClone(state.tweenBySection[side].camera);
      editor.setSelectedKeyframeDuration({ state }, { duration: 1500 });
      const saved = persisted(state, side);
      expect(validatePayload(command(saved))).toEqual({ valid: true });
      const savedTween =
        side === "update" ? saved.animation.tween : saved.animation[side].tween;
      const rounded = { x: 0, y: 0, scaleX: 0.01, scaleY: 0.01 };
      for (const [property, value] of Object.entries(rounded)) {
        expect(savedTween[property]).toMatchObject({
          initialValue: value,
          keyframes: [{ duration: 1500, value, startValue: value }],
        });
      }
      expect(state.tweenBySection[side].camera.initialValue).toEqual(
        authored.initialValue,
      );
      const deps = createDeps(state);
      for (const target of [
        {},
        { index: 0, field: "startValue" },
        { index: 0 },
      ]) {
        editor.openCameraEditor({ state }, { side, ...target });
        await handleCameraDone(deps);
      }
      expect(state.tweenBySection[side].camera).toMatchObject({
        initialValue: rounded,
        keyframes: [{ value: rounded, startValue: rounded }],
      });
      editor.openDialog({ state }, { editMode: true, itemData: saved });
      expect(persisted(state, side)).toEqual(saved);
    },
  );

  it("only floors positive scales, not positions or invalid scales", () => {
    expect(
      roundCameraPose({
        x: 0.001,
        y: -0.001,
        scaleX: Number.MIN_VALUE,
        scaleY: 0.0149,
      }),
    ).toEqual({
      x: 0,
      y: 0,
      scaleX: 0.01,
      scaleY: 0.01,
    });
    expect(roundCameraPose({ x: 0, y: 0, scaleX: 0, scaleY: -1 })).toEqual({
      x: 0,
      y: 0,
      scaleX: 0,
      scaleY: -1,
    });
  });

  it.each(
    ["update", "prev", "next"].flatMap((side) =>
      [true, false].map((touch) => ({ side, touch })),
    ),
  )(
    "edits $side Camera timing and easing from the keyframe dialog (touch: $touch) without changing poses",
    async ({ side, touch }) => {
      const state = createState(side);
      editor.setUiConfig(
        { state },
        { uiConfig: { inputMode: touch ? "touch" : "mouse" } },
      );
      const camera = state.tweenBySection[side].camera;
      camera.keyframes[0].delay = 150;
      camera.keyframes[0].startValue = {
        x: 800,
        y: 450,
        scaleX: 0.8,
        scaleY: 0.9,
      };
      const before = structuredClone(camera);
      const deps = createDeps(state);
      deps.refs = { editKeyframeForm: { reset: vi.fn(), setValues: vi.fn() } };
      const open = () => {
        if (touch) {
          handleKeyframeClick(deps, {
            _event: {
              detail: { side, property: "camera", index: 0, x: 40, y: 80 },
            },
          });
        } else {
          editor.setPopover(
            { state },
            {
              mode: "keyframeMenu",
              payload: { side, property: "camera", index: 0 },
            },
          );
          handleKeyframeDropdownItemClick(deps, {
            _event: { detail: { item: { value: "edit" } } },
          });
        }
      };
      open();
      expect(state.cameraEditor).toBeUndefined();
      expect(view(state).showEditKeyframeDialog).toBe(true);
      expect(view(state).showRightPanel).toBe(!touch);
      expect(deps.refs.editKeyframeForm.setValues).toHaveBeenCalledWith({
        values: { delay: 150, duration: 1000, easing: "linear" },
      });
      expect(view(state).editKeyframeDefaultValues).toEqual({
        delay: 150,
        duration: 1000,
        easing: "linear",
      });
      expect(
        view(state).updateKeyframeForm.fields.map(
          (field) => field.name ?? field.slot,
        ),
      ).toEqual(["delay", "duration", "camera-value", "easing"]);
      const markup = renderViewYaml(
        "src/pages/animationEditor/animationEditor.view.yaml",
        view(state),
      );
      expect(
        JSDOM.fragment(markup).querySelector(
          "#editKeyframeForm #adjustCameraKeyframeDialog[slot=camera-value]",
        ),
      ).not.toBeNull();

      handleAdjustCamera(deps);
      expect(state.cameraEditor.pose).toEqual(before.keyframes[0].value);
      editor.setCameraEditorPose(
        { state },
        { pose: { x: 900, y: 500, scaleX: 1.2, scaleY: 1.3 } },
      );
      handleCameraClose(deps);
      expect(view(state).showEditKeyframeDialog).toBe(true);
      expect(camera).toEqual(before);
      handleClosePopover(deps);
      expect(camera).toEqual(before);
      expect(deps.store.queueAutosave).not.toHaveBeenCalled();

      open();
      handleAdjustCamera(deps);
      const pose = { x: 900, y: 500, scaleX: 1.2, scaleY: 1.3 };
      editor.setCameraEditorPose({ state }, { pose });
      await handleCameraDone(deps);
      expect(view(state).showEditKeyframeDialog).toBe(true);
      handleEditKeyframeFormSubmit(deps, {
        _event: {
          detail: {
            values: { delay: 200, duration: 1600, easing: "easeInQuad" },
          },
        },
      });
      expect(view(state).showEditKeyframeDialog).toBe(false);
      expect(camera.initialValue).toEqual(before.initialValue);
      expect(camera.keyframes[0]).toMatchObject({
        delay: 200,
        duration: 1600,
        easing: "easeInQuad",
        value: pose,
        startValue: before.keyframes[0].startValue,
        relative: false,
      });
      const saved = persisted(state, side);
      expect(
        validatePayload({
          type: "animation.create",
          payload: { animationId: "camera-one", data: saved },
        }),
      ).toEqual({ valid: true });
      editor.openDialog({ state }, { editMode: true, itemData: saved });
      expect(state.tweenBySection[side].camera).toEqual(camera);
      expect(deps.store.queueAutosave).toHaveBeenCalledTimes(2);
    },
  );

  it.each(["update", "prev", "next"])(
    "stores two-decimal %s Camera initial, start, and end poses after Done and reopening",
    async (side) => {
      const state = createState(side);
      const deps = createDeps(state);
      const camera = state.tweenBySection[side].camera;
      camera.keyframes[0].startValue = { ...camera.initialValue };
      const pose = {
        x: 962.2567,
        y: -539.5432,
        scaleX: 1.252567,
        scaleY: 1.2100000000000004,
      };
      const rounded = { x: 962.26, y: -539.54, scaleX: 1.25, scaleY: 1.21 };
      for (const target of [
        {},
        { index: 0, field: "startValue" },
        { index: 0 },
      ]) {
        editor.openCameraEditor({ state }, { side, ...target });
        editor.setCameraEditorPose({ state }, { pose });
        await handleCameraDone(deps);
      }
      expect(camera.initialValue).toEqual(rounded);
      expect(camera.keyframes[0].startValue).toEqual(rounded);
      expect(camera.keyframes[0].value).toEqual(rounded);
      const saved = JSON.parse(JSON.stringify(persisted(state, side)));
      const tween =
        side === "update" ? saved.animation.tween : saved.animation[side].tween;
      for (const [property, value] of Object.entries(rounded)) {
        expect(tween[property]).toMatchObject({
          initialValue: value,
          keyframes: [{ startValue: value, value }],
        });
      }
      expect(
        validatePayload({
          type: "animation.create",
          payload: { animationId: "camera-one", data: saved },
        }),
      ).toEqual({ valid: true });
      const reopened = editor.createInitialState();
      editor.openDialog(
        { state: reopened },
        { editMode: true, itemData: saved },
      );
      expect(reopened.tweenBySection[side].camera).toEqual(camera);
      expect(deps.store.queueAutosave).toHaveBeenCalledTimes(3);
    },
  );

  it("rounds existing Camera precision when serializing without rounding independent scalar tracks", () => {
    const pose = {
      x: -0.001,
      y: 540.654321,
      scaleX: 1.123456,
      scaleY: 1.234567,
    };
    const camera = {
      initialValue: pose,
      keyframes: [
        { duration: 1000, easing: "linear", startValue: pose, value: pose },
      ],
    };
    const scalar = { keyframes: [{ duration: 1000, value: 0.1234567 }] };
    const authored = { camera, alpha: scalar };
    const before = structuredClone(authored);
    const saved = expandCameraTrack(authored);
    const expected = { x: 0, y: 540.65, scaleX: 1.12, scaleY: 1.23 };
    for (const [property, value] of Object.entries(expected)) {
      expect(saved[property]).toMatchObject({
        initialValue: value,
        keyframes: [{ value, startValue: value }],
      });
    }
    expect(saved.alpha).toBe(scalar);
    expect(authored).toEqual(before);
    const ungrouped = { x: scalar, scaleX: scalar };
    expect(expandCameraTrack(ungrouped)).toBe(ungrouped);
  });

  it.each(["update", "prev", "next"])(
    "renders a 0–1 easing curve for %s Camera independently of its poses",
    (side) => {
      const state = createState(side);
      const camera = state.tweenBySection[side].camera;
      const propertiesKey = {
        update: "updateProperties",
        prev: "previousProperties",
        next: "nextProperties",
      }[side];
      const readCurve = () => {
        const authored = structuredClone(camera);
        const viewData = timeline.selectViewData({
          state: timeline.createInitialState(),
          props: { properties: view(state)[propertiesKey] },
        });
        const dom = new JSDOM(
          renderViewYaml(
            "src/components/keyframeTimeline/keyframeTimeline.view.yaml",
            viewData,
          ),
        );
        try {
          expect(camera).toEqual(authored);
          return dom.window.document
            .querySelector("[data-value-curve=camera] path")
            .getAttribute("d");
        } finally {
          dom.window.close();
        }
      };
      const linear = readCurve();
      expect(linear).toMatch(/^M0\.00,19\.00 .*L100\.00,1\.00$/);
      expect(linear).toContain("L50.00,10.00");
      camera.keyframes[0].easing = "easeInQuad";
      const eased = readCurve();
      expect(eased).not.toBe(linear);
      expect(eased).toContain("L50.00,14.50");

      camera.keyframes[0].value = {
        x: -100.25,
        y: 42.125,
        scaleX: 0.8,
        scaleY: 0.8,
      };
      camera.keyframes[0].startValue = camera.initialValue;
      delete camera.initialValue;
      expect(readCurve()).toBe(eased);
      delete camera.keyframes[0].startValue;
      expect(readCurve()).toBe(eased);
      expect(JSON.stringify(persisted(state, side))).not.toContain(
        "valueCurveMode",
      );
    },
  );

  it.each(["update", "prev", "next"])(
    "formats zoom and X/Y for each %s Camera pose without mutating state on read",
    (side) => {
      const state = createState(side);
      const camera = state.tweenBySection[side].camera;
      camera.initialValue = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
      camera.keyframes[0].startValue = {
        x: -12.345,
        y: 540.6789,
        scaleX: 1.25,
        scaleY: 1.25,
      };
      camera.keyframes[0].value = { x: 960, y: 540, scaleX: 1.2, scaleY: 1.2 };
      const authored = structuredClone(camera);
      const readLabel = (id) => {
        const dom = new JSDOM(
          renderViewYaml(
            "src/pages/animationEditor/animationEditor.view.yaml",
            view(state),
          ),
        );
        try {
          const button = dom.window.document.getElementById(id);
          expect(button.tagName).toBe("BUTTON");
          expect(button.type).toBe("button");
          expect(button.hasAttribute("data-camera-value")).toBe(true);
          expect(button.getAttribute("aria-haspopup")).toBe("dialog");
          expect(button.getAttribute("aria-label")).toBe(
            `Adjust camera: ${button.textContent}`,
          );
          return button.textContent;
        } finally {
          dom.window.close();
        }
      };
      expect(readLabel("adjustCameraInitial")).toBe("100% · X 0 · Y 0");
      expect(readLabel("adjustCameraStartValue")).toBe(
        "125% · X -12.35 · Y 540.68",
      );
      expect(readLabel("adjustCameraKeyframe")).toBe("120% · X 960 · Y 540");
      expect(camera).toEqual(authored);
      editor.openCameraEditor({ state }, { side, index: 0 });
      editor.setCameraEditorPose(
        { state },
        { pose: { x: 800.125, y: -0.001, scaleX: 0.8, scaleY: 0.8 } },
      );
      expect(readLabel("adjustCameraKeyframe")).toBe("120% · X 960 · Y 540");
      editor.commitCameraEditor({ state });
      expect(readLabel("adjustCameraKeyframe")).toBe("80% · X 800.13 · Y 0");
      editor.setSelectedProperty({ state }, { side, property: "camera" });
      expect(readLabel("adjustCameraInitial")).toBe("100% · X 0 · Y 0");
    },
  );

  it.each(["update", "prev", "next"])(
    "renders the actual starting and ending zoom on %s Camera bars without changing authored poses",
    (side) => {
      const state = createState(side);
      const camera = state.tweenBySection[side].camera;
      const pose = (scale) => ({
        x: 960,
        y: 540,
        scaleX: scale,
        scaleY: scale,
      });
      camera.initialValue = pose(0.8);
      camera.keyframes = [
        { duration: 1000, value: pose(1.2) },
        { duration: 1000, startValue: pose(0.9), value: pose(1.4) },
        { duration: 1000, value: pose(1.6) },
      ];
      const authored = structuredClone(camera);
      const readLabels = () => {
        const propertiesKey = {
          update: "updateProperties",
          prev: "previousProperties",
          next: "nextProperties",
        }[side];
        const viewData = timeline.selectViewData({
          state: timeline.createInitialState(),
          props: { properties: view(state)[propertiesKey] },
        });
        const dom = new JSDOM(
          renderViewYaml(
            "src/components/keyframeTimeline/keyframeTimeline.view.yaml",
            viewData,
          ),
        );
        try {
          return Array.from(
            dom.window.document.querySelectorAll(
              "[data-keyframe=true][data-property=camera]",
            ),
            (bar) => ({
              start: bar.querySelector("rtgl-text[ta=s]")?.textContent,
              end: bar.querySelector("rtgl-text[ta=e]")?.textContent,
            }),
          );
        } finally {
          dom.window.close();
        }
      };
      expect(readLabels()).toEqual([
        { start: "80%", end: "120%" },
        { start: "90%", end: "140%" },
        { start: "140%", end: "160%" },
      ]);
      expect(camera).toEqual(authored);
      camera.keyframes[0].startValue = pose(0.6);
      expect(readLabels()[0]).toEqual({ start: "60%", end: "120%" });
      delete camera.keyframes[0].startValue;
      expect(readLabels()[0]).toEqual({ start: "80%", end: "120%" });
      expect(camera).toEqual(authored);
    },
  );

  const createDeps = (state) => ({
    store: {
      ...Object.fromEntries(
        Object.entries(editor).map(([name, fn]) => [
          name,
          (...args) => fn({ state, i18n: EN_I18N }, ...args),
        ]),
      ),
      queueAutosave: vi.fn(),
      selectAutosavePersistedVersion: () => 1,
      selectAutosaveVersion: () => 1,
    },
    graphicsService: {
      render: vi.fn(),
      setAnimationTime: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
    },
    appService: { showToast: vi.fn() },
    render: vi.fn(),
    i18n: EN_I18N,
  });

  it.each(["update", "prev", "next"])(
    "uses a movable grid for %s Camera when no image is selected",
    (side) => {
      const state = createState(side);
      const preview = () =>
        side === "prev"
          ? editor.selectAnimationResetState({ state })
          : editor.selectAnimationRenderStateWithAnimations({ state });
      const subject = preview().elements[1];
      expect(subject.type).toBe("container");
      expect(subject.children).toHaveLength(19);
      expect(subject.children[1]).toMatchObject({
        x: state.projectResolution.width / 10,
      });

      editor.setImages(
        { state },
        {
          images: {
            items: {
              "image-one": { fileId: "file-one", width: 800, height: 600 },
            },
          },
        },
      );
      const target = {
        update: "preview-target",
        prev: "preview-outgoing",
        next: "preview-incoming",
      }[side];
      editor.setPreviewImage({ state }, { target, imageId: "image-one" });
      expect(preview().elements[1]).toMatchObject({
        type: "sprite",
        src: "file-one",
        width: 800,
        height: 600,
      });
      expect(preview().elements[1].children).toBeUndefined();
    },
  );

  it("keeps ordinary animation placeholders unchanged", () => {
    const state = editor.createInitialState();
    expect(
      editor.selectAnimationResetState({ state }).elements[1],
    ).toMatchObject({
      type: "rect",
      fill: "white",
    });
  });

  it.each(["update", "prev", "next"])(
    "removes and restores the %s Camera initial pose from the first keyframe and property panels",
    async (side) => {
      const state = createState(side);
      const deps = createDeps(state);
      const camera = state.tweenBySection[side].camera;
      const defaultPose = { ...camera.initialValue };
      camera.initialValue = { x: 800, y: 450, scaleX: 0.8, scaleY: 0.8 };
      camera.keyframes[0].value = { x: 900, y: 500, scaleX: 1.2, scaleY: 1.2 };
      const keyframes = structuredClone(camera.keyframes);
      const render = () =>
        renderViewYaml(
          "src/pages/animationEditor/animationEditor.view.yaml",
          view(state),
        );
      expect(render()).toContain('id="removeCameraInitialValue"');
      await handleRemoveCameraInitialValue(deps);
      expect(camera).not.toHaveProperty("initialValue");
      expect(camera.keyframes).toEqual(keyframes);
      expect(render()).not.toContain('id="removeCameraInitialValue"');
      expect(render()).not.toContain('id="adjustCameraInitial"');
      expect(view(state).selectedKeyframeAddMenuItems).toContainEqual({
        label: "Initial value",
        type: "item",
        value: "initial-value",
      });
      expect(deps.store.queueAutosave).toHaveBeenCalledOnce();
      expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(0);
      const saved = persisted(state, side);
      const tween =
        side === "update" ? saved.animation.tween : saved.animation[side].tween;
      for (const property of ["x", "y", "scaleX", "scaleY"]) {
        expect(tween[property]).not.toHaveProperty("initialValue");
      }
      expect(
        validatePayload({
          type: "animation.create",
          payload: { animationId: "camera-one", data: saved },
        }),
      ).toEqual({ valid: true });
      const reopened = createState(side);
      editor.openDialog(
        { state: reopened },
        { itemData: saved, editMode: true },
      );
      expect(reopened.tweenBySection[side].camera).not.toHaveProperty(
        "initialValue",
      );
      expect(editor.selectDefaultSelectedKeyframeStartValue({ state })).toEqual(
        defaultPose,
      );
      editor.addKeyframe(
        { state },
        { side, property: "camera", index: 0, duration: 1000 },
      );
      expect(camera.keyframes[0].value).toEqual(defaultPose);
      editor.deleteKeyframe({ state }, { side, property: "camera", index: 0 });
      editor.setSelectedKeyframe(
        { state },
        { side, property: "camera", index: 0 },
      );
      handleSelectedKeyframeAddMenuItemClick(deps, {
        _event: { detail: { item: { value: "initial-value" } } },
      });
      expect(state.cameraEditor.pose).toEqual(defaultPose);
      editor.closeCameraEditor({ state });
      expect(camera).not.toHaveProperty("initialValue");
      handleAdjustInitialCamera(deps);
      await handleCameraDone(deps);
      expect(camera.initialValue).toEqual(defaultPose);
      expect(camera.keyframes).toEqual(keyframes);
      editor.setSelectedProperty({ state }, { side, property: "camera" });
      expect(render()).toContain('id="removeCameraInitialValue"');
      await handleRemoveCameraInitialValue(deps);
      expect(render()).toContain('id="addCameraInitialValue"');
      expect(render()).not.toContain('id="removeCameraInitialValue"');
      handleAdjustInitialCamera(deps);
      await handleCameraDone(deps);
      expect(render()).not.toContain('id="addCameraInitialValue"');
      expect(camera.initialValue).toEqual(defaultPose);
      expect(camera.keyframes).toEqual(keyframes);
    },
  );

  it.each(["update", "prev", "next"])(
    "edits and previews the initial %s Camera independently of the first keyframe",
    async (side) => {
      const state = createState(side);
      const deps = createDeps(state);
      const finalPose = {
        ...state.tweenBySection[side].camera.keyframes[0].value,
      };
      const initialPose = { x: 800, y: 450, scaleX: 1.25, scaleY: 1.4 };
      expect(view(state).selectedKeyframeDetailFields).toContainEqual({
        type: "slot",
        slot: "camera-initial-value",
      });
      handleAdjustInitialCamera(deps);
      expect(view(state).cameraEditorInitial).toBe(true);
      editor.setCameraEditorPose({ state }, { pose: initialPose });
      await handleCameraDone(deps);
      expect(state.tweenBySection[side].camera.initialValue).toEqual(
        initialPose,
      );
      expect(state.tweenBySection[side].camera.keyframes[0].value).toEqual(
        finalPose,
      );
      expect(deps.graphicsService.render).toHaveBeenCalledTimes(2);
      expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(0);
      expect(state.previewPlayheadTimeMs).toBe(0);
      expect(deps.store.queueAutosave).toHaveBeenCalledOnce();
      const reopened = editor.createInitialState();
      editor.openDialog(
        { state: reopened },
        { itemData: persisted(state, side), editMode: true },
      );
      expect(reopened.tweenBySection[side].camera.initialValue).toEqual(
        initialPose,
      );
    },
  );

  it("refreshes an applied keyframe at its end and keeps the preview scrubbable", async () => {
    const state = createState();
    const deps = createDeps(state);
    editor.openCameraEditor({ state }, { side: "update", index: 0 });
    editor.setCameraEditorPose(
      { state },
      { pose: { x: 1100, y: 600, scaleX: 1.5, scaleY: 1.5 } },
    );
    await handleCameraDone(deps);
    expect(deps.graphicsService.render).toHaveBeenLastCalledWith(
      editor.selectAnimationRenderStateWithAnimations({ state }),
    );
    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(999);
    expect(state.previewPlayheadTimeMs).toBe(1000);
    await handleRulerTimeScrub(deps, { _event: { detail: { timeMs: 250 } } });
    expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(250);
    expect(deps.graphicsService.render).toHaveBeenCalledTimes(2);
    expect(deps.appService.showToast).not.toHaveBeenCalled();
  });

  it.each(["update", "prev", "next"])(
    "adds, edits, persists and removes a per-keyframe starting Camera on %s",
    async (side) => {
      const state = createState(side);
      const deps = createDeps(state);
      const camera = state.tweenBySection[side].camera;
      const initialPose = { ...camera.initialValue };
      const previousPose = { x: 1000, y: 500, scaleX: 1.3, scaleY: 1.2 };
      camera.keyframes[0].value = previousPose;
      editor.addKeyframe(
        { state },
        { side, property: "camera", duration: 600, delay: 120 },
      );
      const selected = { side, property: "camera", index: 1 };
      editor.setSelectedKeyframe({ state }, selected);
      expect(view(state).selectedKeyframeAddMenuItems).toContainEqual({
        label: "Start value",
        type: "item",
        value: "start-value",
      });
      editor.setPopover(
        { state },
        { mode: "selectedKeyframeAddMenu", payload: selected },
      );
      handleSelectedKeyframeAddMenuItemClick(deps, {
        _event: { detail: { item: { value: "start-value" } } },
      });
      expect(camera.keyframes[1].startValue).toEqual(previousPose);
      expect(camera.keyframes[1].startValue).not.toBe(
        camera.keyframes[0].value,
      );
      expect(view(state).selectedKeyframeAddMenuItems).toEqual([]);
      const html = renderViewYaml(
        "src/pages/animationEditor/animationEditor.view.yaml",
        view(state),
      );
      expect(html).toContain('id="adjustCameraStartValue"');
      expect(html).toContain('id="selectedKeyframeRemoveStartValueButton"');
      expect(html).not.toContain('id="selectedKeyframeStartValue"');

      handleAdjustCameraStartValue(deps);
      expect(view(state).cameraEditorInitial).toBe(true);
      const startPose = { x: 850, y: 520, scaleX: 1.6, scaleY: 1.7 };
      editor.setCameraEditorPose({ state }, { pose: startPose });
      await handleCameraDone(deps);
      expect(camera.keyframes[1].startValue).toEqual(startPose);
      expect(camera.initialValue).toEqual(initialPose);
      expect(camera.keyframes[0].value).toEqual(previousPose);
      expect(camera.keyframes[1].value).toEqual(previousPose);
      expect(deps.graphicsService.setAnimationTime).toHaveBeenLastCalledWith(
        1120,
      );

      const data = persisted(state, side);
      expect(
        validatePayload({
          type: "animation.create",
          payload: { animationId: "camera-one", data },
        }),
      ).toEqual({ valid: true });
      const tween =
        side === "update" ? data.animation.tween : data.animation[side].tween;
      for (const property of ["x", "y", "scaleX", "scaleY"]) {
        expect(tween[property].keyframes[1].startValue).toBe(
          startPose[property],
        );
      }
      const reopened = editor.createInitialState();
      editor.openDialog(
        { state: reopened },
        { itemData: data, editMode: true },
      );
      expect(
        reopened.tweenBySection[side].camera.keyframes[1].startValue,
      ).toEqual(startPose);
      editor.setSelectedKeyframe({ state: reopened }, selected);
      handleSelectedKeyframeRemoveStartValueClick(createDeps(reopened));
      expect(view(reopened).selectedKeyframeAddMenuItems).toHaveLength(1);
      for (const config of Object.values(
        editor.selectProperties({ state: reopened }, { side }),
      )) {
        expect(config.keyframes[1].startValue).toBeUndefined();
      }
    },
  );

  it("defaults the first Camera keyframe start to its track initial pose and keeps edits cancellable under Immer", () => {
    let state = createState();
    const initialPose = { x: 500, y: 300, scaleX: 0.8, scaleY: 0.9 };
    state.tweenBySection.update.camera.initialValue = initialPose;
    state = produce(state, (draft) => {
      editor.setSelectedKeyframeStartValue(
        { state: draft },
        {
          startValue: editor.selectDefaultSelectedKeyframeStartValue({
            state: draft,
          }),
        },
      );
      editor.openCameraEditor(
        { state: draft },
        { side: "update", index: 0, field: "startValue" },
      );
      editor.setCameraEditorPose(
        { state: draft },
        { pose: { x: 900, y: 400, scaleX: 1.5, scaleY: 1.5 } },
      );
      editor.closeCameraEditor({ state: draft });
    });
    expect(state.tweenBySection.update.camera.keyframes[0].startValue).toEqual(
      initialPose,
    );
    state = produce(state, (draft) => {
      editor.openCameraEditor(
        { state: draft },
        { side: "update", index: 0, field: "startValue" },
      );
      expect(editor.selectCameraEditorTimeMs({ state: draft })).toBe(0);
      editor.commitCameraEditor({ state: draft });
    });
    expect(state.tweenBySection.update.camera.keyframes[0].startValue).toEqual(
      initialPose,
    );
  });

  it("reports preview failures without discarding an applied Camera pose", async () => {
    const state = createState();
    const deps = createDeps(state);
    deps.graphicsService.render.mockRejectedValue(new Error("Render failed"));
    editor.openCameraEditor({ state }, { side: "update", index: 0 });
    const pose = { x: 1100, y: 600, scaleX: 1.5, scaleY: 1.5 };
    editor.setCameraEditorPose({ state }, { pose });
    await handleCameraDone(deps);
    expect(state.tweenBySection.update.camera.keyframes[0].value).toEqual(pose);
    expect(deps.store.queueAutosave).toHaveBeenCalledOnce();
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Failed to render animation preview.",
    });
  });
  it("persists explicit ungrouping without adding markers to legacy animations", () => {
    const legacy = editor.createInitialState();
    expect(editor.selectCameraTracks({ state: legacy })).toBeUndefined();
    const state = createState();
    const data = persisted(state);
    const reopened = editor.createInitialState();
    editor.openDialog({ state: reopened }, { editMode: true, itemData: data });
    editor.deleteProperty(
      { state: reopened },
      { side: "update", property: "camera" },
    );
    expect(editor.selectCameraTracks({ state: reopened })).toEqual([]);
    editor.addProperty({ state: reopened }, { side: "update", property: "x" });
    expect(reopened.tweenBySection.update.x).toBeDefined();
  });
  it("renders Camera keyframes and initial poses without scalar value inputs", () => {
    const state = createState();
    const render = () =>
      renderViewYaml(
        "src/pages/animationEditor/animationEditor.view.yaml",
        view(state),
      );
    expect(render()).toContain('id="adjustCameraKeyframe"');
    expect(render()).not.toContain('id="selectedKeyframeValue"');
    editor.setSelectedProperty(
      { state },
      { side: "update", property: "camera" },
    );
    expect(render()).toContain('id="adjustCameraInitial"');
    expect(render()).not.toContain('id="selectedPropertyInitialValue"');
    editor.openCameraEditor({ state }, { side: "update" });
    expect(render()).toContain('id="cameraDialog"');
  });
  it.each(["update", "prev", "next"])(
    "creates one Camera track with synchronized defaults on %s",
    (side) => {
      const state = createState(side);
      const camera = state.tweenBySection[side].camera;
      expect(camera.initialValue).toEqual({
        x: state.projectResolution.width / 2,
        y: state.projectResolution.height / 2,
        scaleX: 1,
        scaleY: 1,
      });
      expect(camera.keyframes[0].value).toEqual(camera.initialValue);
      expect(editor.selectCameraTracks({ state })).toEqual([side]);
      expect(
        validatePayload({
          type: "animation.create",
          payload: { animationId: "camera-one", data: persisted(state, side) },
        }),
      ).toEqual({ valid: true });
      const rendered = editor.selectAnimationRenderStateWithAnimations({
        state,
      });
      expect(JSON.stringify(rendered)).not.toContain('"camera"');
      expect(JSON.stringify(rendered)).not.toContain("null");
      expect(editor.selectPreviewDurationMs({ state })).toBe(1000);
    },
  );

  it.each(["x", "y", "scaleX", "scaleY", "translateX", "translateY"])(
    "keeps Camera mutually exclusive with %s",
    (property) => {
      const state = createState();
      editor.addProperty({ state }, { side: "update", property });
      expect(state.tweenBySection.update[property]).toBeUndefined();
      editor.deleteProperty({ state }, { side: "update", property: "camera" });
      editor.addProperty({ state }, { side: "update", property });
      editor.addProperty({ state }, { side: "update", property: "camera" });
      expect(state.tweenBySection.update.camera).toBeUndefined();
      editor.setPopover(
        { state },
        { mode: "addProperty", payload: { side: "update" } },
      );
      expect(
        view(state).addPropertyForm.fields[0].options.map(
          (option) => option.value,
        ),
      ).not.toContain("camera");
    },
  );

  it("only offers the property choice when adding Camera, with visual controls in the detail panel", () => {
    const state = editor.createInitialState();
    editor.setPopover(
      { state },
      { mode: "addProperty", payload: { side: "update" } },
    );
    editor.updatePopoverFormValues(
      { state },
      { formValues: { property: "camera" } },
    );
    expect(
      view(state).addPropertyForm.fields.map((field) => field.name),
    ).toEqual(["property"]);
    editor.addProperty({ state }, { side: "update", property: "camera" });
    expect(
      view(state).selectedKeyframeDetailFields.map((field) => field.slot),
    ).toContain("camera-value");
    expect(
      view(state).selectedKeyframeDetailFields.map((field) => field.slot),
    ).not.toContain("keyframe-value-type");
    expect(view(state).selectedKeyframeAddMenuItems).toEqual([
      { label: "Start value", type: "item", value: "start-value" },
    ]);
    expect(view(state).updateProperties.camera).toMatchObject({
      label: "Camera",
      valueCurveMode: "progress",
    });
  });

  it("keeps movement as a cancellable draft and commits only on Done, including under Immer", () => {
    let state = createState();
    const initial = state.tweenBySection.update.camera.keyframes[0].value;
    const pose = { x: 300, y: 240, scaleX: 1.5, scaleY: 1.5 };
    state = produce(state, (draft) => {
      editor.openCameraEditor({ state: draft }, { side: "update", index: 0 });
      editor.setCameraEditorPose({ state: draft }, { pose });
    });
    expect(state.tweenBySection.update.camera.keyframes[0].value).toEqual(
      initial,
    );
    state = produce(state, (draft) =>
      editor.closeCameraEditor({ state: draft }),
    );
    expect(state.tweenBySection.update.camera.keyframes[0].value).toEqual(
      initial,
    );
    state = produce(state, (draft) => {
      editor.openCameraEditor({ state: draft }, { side: "update", index: 0 });
      editor.setCameraEditorPose({ state: draft }, { pose });
      editor.commitCameraEditor({ state: draft });
      editor.addKeyframe(
        { state: draft },
        { side: "update", property: "camera", duration: 500, easing: "linear" },
      );
    });
    expect(state.tweenBySection.update.camera.keyframes[0].value).toEqual(pose);
    expect(state.tweenBySection.update.camera.keyframes[1].value).toEqual(pose);
    expect(state.cameraEditor).toBeUndefined();
  });

  it("keeps edits synchronized through timing changes, insertion, reordering, deletion and reopening", () => {
    const state = createState();
    editor.setSelectedKeyframeTiming({ state }, { delay: 50, duration: 1500 });
    editor.setSelectedKeyframeEasing({ state }, { easing: "easeInQuad" });
    editor.addKeyframe(
      { state },
      { side: "update", property: "camera", duration: 500, easing: "linear" },
    );
    editor.moveKeyframeRight(
      { state },
      { side: "update", property: "camera", index: 0 },
    );
    editor.deleteKeyframe(
      { state },
      { side: "update", property: "camera", index: 1 },
    );
    const data = persisted(state);
    expect(
      validatePayload({
        type: "animation.create",
        payload: { animationId: "camera-one", data },
      }),
    ).toEqual({ valid: true });
    const reopened = editor.createInitialState();
    editor.openDialog(
      { state: reopened },
      { editMode: true, itemId: "camera-one", itemData: data },
    );
    expect(reopened.tweenBySection.update).toEqual(state.tweenBySection.update);
    expect(
      groupCameraTrack(expandCameraTrack(state.tweenBySection.update)),
    ).toEqual(state.tweenBySection.update);
    delete data.cameraTracks;
    editor.openDialog(
      { state: reopened },
      { editMode: true, itemId: "camera-one", itemData: data },
    );
    expect(reopened.tweenBySection.update.camera).toBeUndefined();
    expect(reopened.tweenBySection.update).toEqual(data.animation.tween);
  });
});
