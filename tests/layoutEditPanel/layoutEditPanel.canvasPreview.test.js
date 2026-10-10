import { produce } from "immer";
import { describe, expect, it, vi } from "vitest";
import {
  handleFormActions,
  handleOnUpdate,
  handlePopoverFormChange,
  handlePopoverFormInput,
  handlePopoverPresetsButtonClick,
  handlePopoverStepPress,
  handlePopverFormClose,
  handleScaleAspectRatioChange,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import * as layoutEditPanelStore from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { selectLayoutEditPanelCopy } from "../../src/components/layoutEditPanel/support/layoutEditPanelCopy.js";
import { normalizeLayoutRotation } from "../../src/internal/project/layout.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = (name = "x", value = 100) => {
  const events = [];
  return {
    events,
    deps: {
      store: {
        selectPopoverForm: () => ({
          name,
          defaultValues: { value },
          context: {
            presetItems: [
              { label: "0", value: 0, suffixText: "0 px" },
              { label: "1/2", value: 960, suffixText: "960 px" },
              { label: "1", value: 1920, suffixText: "1920 px" },
            ],
          },
        }),
        selectValues: () => ({ x: 100, y: 50 }),
        updatePopoverFormContext: vi.fn(),
        setPopoverFormValue: vi.fn(),
        selectScaleAspectRatioLocked: () => false,
        closePopoverForm: vi.fn(),
      },
      props: { projectResolution: { width: 1920, height: 1080 } },
      i18n: EN_I18N,
      render: vi.fn(),
      dispatchEvent: (event) => events.push(event),
      appService: {
        showDropdownMenu: vi.fn(async () => ({ item: { key: "960" } })),
      },
      refs: { form: { setValues: vi.fn() } },
    },
  };
};

const buttonEvent = (dataset = {}) => ({
  _event: {
    currentTarget: {
      dataset,
      getBoundingClientRect: () => ({ left: 10, bottom: 40 }),
    },
  },
});

const formEvent = (values) => ({ _event: { detail: { values } } });

describe("layout edit panel canvas preview", () => {
  it("previews a value while the slider moves, without rebuilding the form", () => {
    const { deps, events } = createDeps();

    handlePopoverFormInput(deps, formEvent({ value: 412.6 }));

    expect(events.map((event) => [event.type, event.detail])).toEqual([
      ["preview", { formValues: { x: 100, y: 50 }, name: "x", value: 413 }],
    ]);
    // Rebuilding the form remounts it and ends the slider drag.
    expect(deps.store.updatePopoverFormContext).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
    expect(deps.store.setPopoverFormValue).toHaveBeenCalledWith({
      value: 412.6,
    });
  });

  it("moves the other scale with a kept aspect ratio, in previews and on submit", () => {
    let state = layoutEditPanelStore.createInitialState();
    const store = new Proxy(
      {},
      {
        get: (_target, name) => (payload) => {
          if (name.startsWith("select")) {
            return layoutEditPanelStore[name]({ state }, payload);
          }
          let result;
          state = produce(state, (draft) => {
            result = layoutEditPanelStore[name]({ state: draft }, payload);
          });
          return result;
        },
      },
    );
    const events = [];
    const deps = {
      store,
      props: { projectResolution: { width: 1920, height: 1080 } },
      i18n: EN_I18N,
      render: vi.fn(),
      dispatchEvent: (event) => events.push(event),
    };
    // Twice as tall as wide, so the ratio is not just "the same value".
    store.setValues({ values: { id: "element-1", scaleX: 1, scaleY: 2 } });
    store.openPopoverForm({
      name: "scaleX",
      form: { fields: [{ name: "value", type: "input-number" }] },
      copy: selectLayoutEditPanelCopy(EN_I18N),
    });
    expect(state.popover.context.showAspectRatioToggle).toBe(true);

    handlePopoverFormInput(deps, formEvent({ value: 1.5 }));
    expect(events.at(-1).detail).toMatchObject({
      name: "scaleX",
      value: 1.5,
      linkedValues: { scaleY: 3 },
    });

    // Turned off, the preview shows the other scale as it was.
    handleScaleAspectRatioChange(deps, {
      _event: { detail: { value: false } },
    });
    expect(events.at(-1).detail.linkedValues).toBeUndefined();
    handleScaleAspectRatioChange(deps, { _event: { detail: { value: true } } });

    handleFormActions(deps, formEvent({ value: 0.5 }));
    const update = events.at(-1);
    expect(update.type).toBe("update");
    expect(update.detail).toMatchObject({
      name: "scaleX",
      value: 0.5,
      linkedValues: { scaleY: 1 },
    });
    expect(state.values).toMatchObject({ scaleX: 0.5, scaleY: 1 });
  });

  it("moves the other size with a fixed aspect ratio, in previews and on submit", () => {
    let state = layoutEditPanelStore.createInitialState();
    const store = new Proxy(
      {},
      {
        get: (_target, name) => (payload) => {
          if (name.startsWith("select")) {
            return layoutEditPanelStore[name]({ state }, payload);
          }
          let result;
          state = produce(state, (draft) => {
            result = layoutEditPanelStore[name]({ state: draft }, payload);
          });
          return result;
        },
      },
    );
    const events = [];
    const projectResolution = { width: 1920, height: 1080 };
    const deps = {
      store,
      props: { projectResolution },
      i18n: EN_I18N,
      render: vi.fn(),
      dispatchEvent: (event) => events.push(event),
    };
    store.setValues({
      values: {
        id: "element-1",
        type: "sprite",
        width: 400,
        height: 200,
        aspectRatioLock: 2,
      },
    });
    store.openPopoverForm({
      name: "width",
      form: { fields: [{ name: "value", type: "input-number" }] },
      projectResolution,
      copy: selectLayoutEditPanelCopy(EN_I18N),
    });
    expect(state.popover.context.isSliderPopover).toBe(true);

    handlePopoverFormInput(deps, formEvent({ value: 600 }));
    // The owner reads both sizes from the form values, so they carry the
    // previewed ones, while the saved values stay as they were.
    expect(events.at(-1).detail).toMatchObject({
      name: "width",
      value: 600,
      linkedValues: { height: 300 },
      formValues: { width: 600, height: 300, aspectRatioLock: 2 },
    });
    expect(state.values).toMatchObject({ width: 400, height: 200 });

    handleFormActions(deps, formEvent({ value: 800 }));
    const update = events.at(-1);
    expect(update.type).toBe("update");
    expect(update.detail).toMatchObject({
      name: "width",
      value: 800,
      linkedValues: { height: 400 },
      formValues: { width: 800, height: 400 },
    });
    expect(state.values).toMatchObject({ width: 800, height: 400 });
  });

  it("previews a size alone without a fixed aspect ratio", () => {
    const { deps, events } = createDeps("height", 200);
    deps.store.selectValues = () => ({ width: 400, height: 200 });

    handlePopoverFormInput(deps, formEvent({ value: 250 }));

    expect(events[0].detail).toEqual({
      formValues: { width: 400, height: 200 },
      name: "height",
      value: 250,
    });
  });

  it("keeps the slider's form while the canvas preview moves the element", () => {
    let state = layoutEditPanelStore.createInitialState();
    const store = new Proxy(
      {},
      {
        get: (_target, name) => (payload) => {
          if (name.startsWith("select")) {
            return layoutEditPanelStore[name]({ state }, payload);
          }
          let result;
          state = produce(state, (draft) => {
            result = layoutEditPanelStore[name]({ state: draft }, payload);
          });
          return result;
        },
      },
    );
    const projectResolution = { width: 1920, height: 1080 };
    const values = { id: "element-1", type: "sprite", x: 100, y: 50 };
    const deps = {
      store,
      props: { projectResolution, values },
      i18n: EN_I18N,
      render: vi.fn(),
      dispatchEvent: vi.fn(),
    };
    store.setValues({ values });
    store.openPopoverForm({
      x: 0,
      y: 0,
      name: "x",
      form: { fields: [{ name: "value", type: "input-number" }] },
      projectResolution,
      copy: selectLayoutEditPanelCopy(EN_I18N),
    });
    const openedKey = state.popover.key;
    const oldProps = { projectResolution, values };

    handlePopoverFormInput(deps, formEvent({ value: 640 }));
    // The preview moves the element, so the canvas reports new metrics.
    handleOnUpdate(deps, {
      oldProps,
      newProps: {
        projectResolution,
        values: { ...values },
        selectedElementMetrics: { width: 200, height: 100 },
      },
    });

    // Not rebuilt, so the slider keeps its drag.
    expect(state.popover.key).toBe(openedKey);
    expect(state.popover.defaultValues.value).toBe(640);

    // A real change to the values rebuilds it from where the slider is.
    handleOnUpdate(deps, {
      oldProps,
      newProps: { projectResolution, values: { ...values, y: 60 } },
    });
    expect(state.popover.key).toBe(openedKey + 1);
    expect(state.popover.defaultValues.value).toBe(640);
  });

  it("previews only plain numbers", () => {
    const { deps, events } = createDeps();

    handlePopoverFormInput(deps, formEvent({ value: "${variables.x}" }));
    handlePopoverFormInput(deps, formEvent({ value: "" }));

    expect(events).toEqual([]);
  });

  it("previews a committed value and a preset picked from the Presets menu", async () => {
    const { deps, events } = createDeps();

    handlePopoverFormChange(deps, formEvent({ value: 300 }));
    await handlePopoverPresetsButtonClick(deps, buttonEvent());

    // Each preset shows its value in pixels beside it.
    expect(deps.appService.showDropdownMenu).toHaveBeenCalledWith({
      items: [
        { type: "item", label: "0", suffixText: "0 px", key: "0" },
        { type: "item", label: "1/2", suffixText: "960 px", key: "960" },
        { type: "item", label: "1", suffixText: "1920 px", key: "1920" },
      ],
      x: 10,
      y: 40,
      place: "bs",
    });
    expect(events.map((event) => event.detail.value)).toEqual([300, 960]);
    expect(deps.store.updatePopoverFormContext).toHaveBeenCalledTimes(2);
  });

  it("changes nothing when the Presets menu closes without a pick", async () => {
    const { deps, events } = createDeps();
    deps.appService.showDropdownMenu.mockResolvedValue(undefined);

    await handlePopoverPresetsButtonClick(deps, buttonEvent());

    expect(events).toEqual([]);
    expect(deps.store.updatePopoverFormContext).not.toHaveBeenCalled();
  });

  it("steps the value by one, or by ten as Shift and the wheel do", () => {
    const { deps, events } = createDeps();

    for (const delta of ["-10", "-1", "1", "10"]) {
      handlePopoverStepPress(deps, buttonEvent({ delta }));
    }

    // Each step starts from the popover's value, 100 here.
    expect(events.map((event) => event.detail.value)).toEqual([
      90, 99, 101, 110,
    ]);
    // The form takes the value in place, so a held button is not replaced.
    expect(deps.refs.form.setValues).toHaveBeenLastCalledWith({
      values: { value: 110 },
    });
    expect(deps.store.setPopoverFormValue).toHaveBeenLastCalledWith({
      value: 110,
    });
    expect(deps.store.updatePopoverFormContext).not.toHaveBeenCalled();
  });

  it("steps rotation by 1 and 15 degrees", () => {
    const { deps, events } = createDeps("rotation", 30);

    for (const delta of ["-15", "1"]) {
      handlePopoverStepPress(deps, buttonEvent({ delta }));
    }

    expect(events.map((event) => event.detail.value)).toEqual([15, 31]);
  });

  it("steps scale in hundredths, past 1 and 2 since scale has no bound", () => {
    const { deps, events } = createDeps("scaleX", 1.95);

    for (const delta of ["0.1", "-0.01"]) {
      handlePopoverStepPress(deps, buttonEvent({ delta }));
    }

    expect(events.map((event) => event.detail.value)).toEqual([2.05, 1.94]);
  });

  it("steps opacity in hundredths, kept between 0 and 1", () => {
    const { deps, events } = createDeps("opacity", 0.95);

    for (const delta of ["0.1", "0.01", "-0.01"]) {
      handlePopoverStepPress(deps, buttonEvent({ delta }));
    }

    // No floating-point noise such as 0.9400000000000001.
    expect(events.map((event) => event.detail.value)).toEqual([1, 0.96, 0.94]);
  });

  it("steps a size by 1 and 10, never below 0", () => {
    const { deps, events } = createDeps("width", 5);

    for (const delta of ["-10", "1", "10"]) {
      handlePopoverStepPress(deps, buttonEvent({ delta }));
    }

    expect(events.map((event) => event.detail.value)).toEqual([0, 6, 15]);
  });

  it("normalizes a rotation preview like a saved value", () => {
    const { deps, events } = createDeps("rotation");

    handlePopoverFormInput(deps, formEvent({ value: 12.34567 }));

    expect(events[0].detail.value).toBe(normalizeLayoutRotation(12.34567));
    expect(events[0].detail.value).not.toBe(12.34567);
  });

  it("cancels the preview when the popover closes without submitting", () => {
    const { deps, events } = createDeps();

    handlePopverFormClose(deps);

    expect(deps.store.closePopoverForm).toHaveBeenCalledOnce();
    expect(events.map((event) => event.type)).toEqual(["preview-cancel"]);
  });
});
