import { getTransitionAnimationOptions } from "../../internal/animationOptions.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const DEFAULT_SCREEN_OPACITY = 1;
const DEFAULT_SCREEN_BLUR = {
  x: 6,
  y: 9,
  quality: 3,
  kernelSize: 9,
  repeatEdgePixels: true,
};
const SCREEN_BLUR_KERNEL_SIZE_OPTIONS = [5, 7, 9, 11, 13, 15];

const normalizeScreenOpacity = (opacity) => {
  if (opacity === undefined || opacity === null || opacity === "") {
    return undefined;
  }

  const parsedOpacity = Number(opacity);
  if (!Number.isFinite(parsedOpacity)) {
    return undefined;
  }

  return Math.max(0, Math.min(1, parsedOpacity));
};

const normalizeScreenBlurNumber = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
};

const normalizeScreenBlurBoolean = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return value === true || value === "true";
};

const normalizeScreenBlurKernelSize = (value) => {
  const parsedValue = normalizeScreenBlurNumber(
    value,
    DEFAULT_SCREEN_BLUR.kernelSize,
  );

  if (SCREEN_BLUR_KERNEL_SIZE_OPTIONS.includes(parsedValue)) {
    return parsedValue;
  }

  return SCREEN_BLUR_KERNEL_SIZE_OPTIONS.reduce((closest, option) => {
    const currentDistance = Math.abs(option - parsedValue);
    const closestDistance = Math.abs(closest - parsedValue);
    return currentDistance < closestDistance ? option : closest;
  }, DEFAULT_SCREEN_BLUR.kernelSize);
};

const normalizeScreenBlur = (blur = {}) => {
  const source =
    blur && typeof blur === "object" && !Array.isArray(blur) ? blur : {};

  return {
    x: normalizeScreenBlurNumber(source.x, DEFAULT_SCREEN_BLUR.x),
    y: normalizeScreenBlurNumber(source.y, DEFAULT_SCREEN_BLUR.y),
    quality: normalizeScreenBlurNumber(
      source.quality,
      DEFAULT_SCREEN_BLUR.quality,
    ),
    kernelSize: normalizeScreenBlurKernelSize(source.kernelSize),
    repeatEdgePixels: normalizeScreenBlurBoolean(
      source.repeatEdgePixels,
      DEFAULT_SCREEN_BLUR.repeatEdgePixels,
    ),
  };
};

const normalizeScreenBlurEnabled = (value) => {
  return value === true || value === "true";
};

const hasFormValue = (formValues, fieldName) => {
  return Object.prototype.hasOwnProperty.call(formValues ?? {}, fieldName);
};

const normalizeScreenFormValues = (values = {}) => {
  const nextValues = {
    ...values,
    opacity: normalizeScreenOpacity(values.opacity),
  };

  if (!hasFormValue(values, "blur")) {
    delete nextValues.blurX;
    delete nextValues.blurY;
    delete nextValues.blurQuality;
    delete nextValues.blurKernelSize;
    delete nextValues.blurRepeatEdgePixels;
    return nextValues;
  }

  const blur = normalizeScreenBlur({
    x: values.blurX,
    y: values.blurY,
    quality: values.blurQuality,
    kernelSize: values.blurKernelSize,
    repeatEdgePixels: values.blurRepeatEdgePixels,
  });

  nextValues.blur = normalizeScreenBlurEnabled(values.blur);
  nextValues.blurX = blur.x;
  nextValues.blurY = blur.y;
  nextValues.blurQuality = blur.quality;
  nextValues.blurKernelSize = blur.kernelSize;
  nextValues.blurRepeatEdgePixels = blur.repeatEdgePixels;

  return nextValues;
};

const getScreenFormValuesFromAction = (screen = {}) => {
  const blur = normalizeScreenBlur(screen.blur);

  return {
    transitionAnimationId: screen?.animations?.resourceId,
    opacity: normalizeScreenOpacity(screen.opacity),
    blur: Boolean(screen.blur),
    blurX: blur.x,
    blurY: blur.y,
    blurQuality: blur.quality,
    blurKernelSize: blur.kernelSize,
    blurRepeatEdgePixels: blur.repeatEdgePixels,
  };
};

const getSelectedFormValue = (formValues, fallbackValues, fieldName) => {
  return hasFormValue(formValues, fieldName)
    ? formValues[fieldName]
    : fallbackValues[fieldName];
};

const form = {
  fields: [
    {
      name: "transitionAnimationId",
      type: "select",
      label: "Animation",
      description: "",
      clearable: true,
      placeholder: "Animation",
      options: "${transitionAnimationOptions}",
    },
    {
      name: "opacity",
      label: "Opacity",
      type: "slider-with-input",
      min: 0,
      max: 1,
      step: 0.01,
    },
    {
      name: "blur",
      label: "Blur",
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: "No Blur" },
        { value: true, label: "Blur" },
      ],
    },
    {
      $when: "blur == true",
      name: "blurX",
      label: "Blur X",
      type: "input-number",
    },
    {
      $when: "blur == true",
      name: "blurY",
      label: "Blur Y",
      type: "input-number",
    },
    {
      $when: "blur == true",
      name: "blurQuality",
      label: "Quality",
      type: "input-number",
    },
    {
      $when: "blur == true",
      name: "blurKernelSize",
      label: "Kernel Size",
      type: "select",
      options: SCREEN_BLUR_KERNEL_SIZE_OPTIONS.map((value) => ({
        value,
        label: String(value),
      })),
    },
    {
      $when: "blur == true",
      name: "blurRepeatEdgePixels",
      label: "Repeat Edge Pixels",
      type: "segmented-control",
      clearable: false,
      options: [
        { value: false, label: "No" },
        { value: true, label: "Yes" },
      ],
    },
  ],
  actions: {
    layout: "",
    buttons: [],
  },
};

export const createInitialState = () => ({
  animations: createEmptyCollection(),
  formValues: {},
});

export const setAnimations = ({ state }, { animations } = {}) => {
  state.animations = animations ?? createEmptyCollection();
};

export const setFormValues = ({ state }, { values } = {}) => {
  state.formValues = normalizeScreenFormValues(values ?? {});
};

export const selectTransitionAnimationId = ({ state }) => {
  return state.formValues?.transitionAnimationId;
};

export const selectScreenOpacity = ({ state }) => {
  return normalizeScreenOpacity(state.formValues?.opacity);
};

export const selectScreenBlur = ({ state }) => {
  if (!normalizeScreenBlurEnabled(state.formValues?.blur)) {
    return undefined;
  }

  return normalizeScreenBlur({
    x: state.formValues?.blurX,
    y: state.formValues?.blurY,
    quality: state.formValues?.blurQuality,
    kernelSize: state.formValues?.blurKernelSize,
    repeatEdgePixels: state.formValues?.blurRepeatEdgePixels,
  });
};

export const selectScreenBlurActionValue = ({ state }) => {
  if (normalizeScreenBlurEnabled(state.formValues?.blur)) {
    return selectScreenBlur({ state });
  }

  if (hasFormValue(state.formValues, "blur")) {
    return null;
  }

  return undefined;
};

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
  const propsFormValues = getScreenFormValuesFromAction(props?.screen);
  const formValues = state.formValues ?? {};
  const selectedAnimationId = getSelectedFormValue(
    formValues,
    propsFormValues,
    "transitionAnimationId",
  );
  const selectedOpacity = normalizeScreenOpacity(
    getSelectedFormValue(formValues, propsFormValues, "opacity"),
  );
  const selectedBlurEnabled = normalizeScreenBlurEnabled(
    getSelectedFormValue(formValues, propsFormValues, "blur"),
  );
  const selectedBlur = normalizeScreenBlur({
    x: getSelectedFormValue(formValues, propsFormValues, "blurX"),
    y: getSelectedFormValue(formValues, propsFormValues, "blurY"),
    quality: getSelectedFormValue(formValues, propsFormValues, "blurQuality"),
    kernelSize: getSelectedFormValue(
      formValues,
      propsFormValues,
      "blurKernelSize",
    ),
    repeatEdgePixels: getSelectedFormValue(
      formValues,
      propsFormValues,
      "blurRepeatEdgePixels",
    ),
  });
  const formKey =
    selectedOpacity !== undefined || selectedBlurEnabled
      ? [
          selectedAnimationId ?? "new-screen",
          selectedOpacity ?? DEFAULT_SCREEN_OPACITY,
          selectedBlurEnabled ? "blur" : "no-blur",
          selectedBlur.x,
          selectedBlur.y,
          selectedBlur.quality,
          selectedBlur.kernelSize,
          selectedBlur.repeatEdgePixels ? "repeat-edge" : "no-repeat-edge",
        ].join(":")
      : (selectedAnimationId ?? "new-screen");

  return {
    breadcrumb: localizeCommandLineBreadcrumb(
      [
        {
          id: "actions",
          label: "Actions",
          click: true,
        },
        {
          label: "Screen",
        },
      ],
      copy,
    ),
    form: localizeCommandLineForm(form, copy),
    formKey,
    defaultValues: {
      ...formValues,
      transitionAnimationId: selectedAnimationId,
      opacity: selectedOpacity ?? DEFAULT_SCREEN_OPACITY,
      blur: selectedBlurEnabled,
      blurX: selectedBlur.x,
      blurY: selectedBlur.y,
      blurQuality: selectedBlur.quality,
      blurKernelSize: selectedBlur.kernelSize,
      blurRepeatEdgePixels: selectedBlur.repeatEdgePixels,
    },
    context: {
      transitionAnimationOptions: getTransitionAnimationOptions(
        state.animations,
        selectedAnimationId,
      ).map((option) => ({
        ...option,
        suffixText: localizeCommandLineText("Transition", copy),
      })),
    },
  };
};
