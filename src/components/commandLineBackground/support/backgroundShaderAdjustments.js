const createHueOperation = ({ uniformExpression, vectorType, webgl }) => {
  const scalarDeclaration = webgl ? "float" : "let";
  const vectorDeclaration = webgl ? vectorType : "let";

  return `
  ${scalarDeclaration} angle = ${uniformExpression} * 0.017453292519943295;
  ${scalarDeclaration} cosine = cos(angle);
  ${scalarDeclaration} sine = sin(angle);
  ${vectorDeclaration} rotated = ${vectorType}(
    rgb.r * (0.213 + cosine * 0.787 - sine * 0.213) +
      rgb.g * (0.715 - cosine * 0.715 - sine * 0.715) +
      rgb.b * (0.072 - cosine * 0.072 + sine * 0.928),
    rgb.r * (0.213 - cosine * 0.213 + sine * 0.143) +
      rgb.g * (0.715 + cosine * 0.285 + sine * 0.140) +
      rgb.b * (0.072 - cosine * 0.072 - sine * 0.283),
    rgb.r * (0.213 - cosine * 0.213 - sine * 0.787) +
      rgb.g * (0.715 - cosine * 0.715 + sine * 0.715) +
      rgb.b * (0.072 + cosine * 0.928 + sine * 0.072)
  );
  rgb = rotated;`;
};

export const BACKGROUND_SHADER_ADJUSTMENTS = Object.freeze([
  {
    id: "brightness",
    filterId: "backgroundBrightness",
    label: "Brightness",
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    webglOperation: "rgb += vec3(uBrightness);",
    webgpuOperation: "rgb += vec3<f32>(shaderUniforms.uBrightness);",
  },
  {
    id: "contrast",
    filterId: "backgroundContrast",
    label: "Contrast",
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    webglOperation: "rgb = (rgb - vec3(0.5)) * (1.0 + uContrast) + vec3(0.5);",
    webgpuOperation:
      "rgb = (rgb - vec3<f32>(0.5)) * (1.0 + shaderUniforms.uContrast) + vec3<f32>(0.5);",
  },
  {
    id: "saturation",
    filterId: "backgroundSaturation",
    label: "Saturation",
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    webglOperation: `float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3(luma), rgb, 1.0 + uSaturation);`,
    webgpuOperation: `let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  rgb = mix(vec3<f32>(luma), rgb, 1.0 + shaderUniforms.uSaturation);`,
  },
  {
    id: "hue",
    filterId: "backgroundHue",
    label: "Hue",
    min: -180,
    max: 180,
    step: 1,
    defaultValue: 0,
    webglOperation: createHueOperation({
      uniformExpression: "uHue",
      vectorType: "vec3",
      webgl: true,
    }),
    webgpuOperation: createHueOperation({
      uniformExpression: "shaderUniforms.uHue",
      vectorType: "vec3<f32>",
      webgl: false,
    }),
  },
  {
    id: "grayscale",
    filterId: "backgroundGrayscale",
    label: "Grayscale",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    webglOperation: `float luma = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
  rgb = mix(rgb, vec3(luma), uGrayscale);`,
    webgpuOperation: `let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  rgb = mix(rgb, vec3<f32>(luma), shaderUniforms.uGrayscale);`,
  },
  {
    id: "sepia",
    filterId: "backgroundSepia",
    label: "Sepia",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    webglOperation: `vec3 sepia = vec3(
    dot(rgb, vec3(0.393, 0.769, 0.189)),
    dot(rgb, vec3(0.349, 0.686, 0.168)),
    dot(rgb, vec3(0.272, 0.534, 0.131))
  );
  rgb = mix(rgb, sepia, uSepia);`,
    webgpuOperation: `let sepia = vec3<f32>(
    dot(rgb, vec3<f32>(0.393, 0.769, 0.189)),
    dot(rgb, vec3<f32>(0.349, 0.686, 0.168)),
    dot(rgb, vec3<f32>(0.272, 0.534, 0.131))
  );
  rgb = mix(rgb, sepia, shaderUniforms.uSepia);`,
  },
  {
    id: "invert",
    filterId: "backgroundInvert",
    label: "Invert",
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: 0,
    webglOperation: "rgb = mix(rgb, vec3(1.0) - rgb, uInvert);",
    webgpuOperation:
      "rgb = mix(rgb, vec3<f32>(1.0) - rgb, shaderUniforms.uInvert);",
  },
]);

const BACKGROUND_SHADER_ADJUSTMENTS_BY_ID = Object.fromEntries(
  BACKGROUND_SHADER_ADJUSTMENTS.map((adjustment) => [
    adjustment.id,
    adjustment,
  ]),
);
const BACKGROUND_SHADER_ADJUSTMENTS_BY_FILTER_ID = Object.fromEntries(
  BACKGROUND_SHADER_ADJUSTMENTS.map((adjustment) => [
    adjustment.filterId,
    adjustment,
  ]),
);

const toUniformName = (parameterName) => {
  return `u${parameterName[0].toUpperCase()}${parameterName.slice(1)}`;
};

const createWebglFragmentSource = (adjustment) => {
  const uniformName = toUniformName(adjustment.id);

  return `precision mediump float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uProgress;
uniform vec2 uResolution;
uniform float ${uniformName};

void main(void)
{
  vec4 color = texture(uTexture, vTextureCoord);
  if (color.a <= 0.0) {
    finalColor = color;
    return;
  }

  vec3 rgb = color.rgb / color.a;
  ${adjustment.webglOperation}
  finalColor = vec4(clamp(rgb, vec3(0.0), vec3(1.0)) * color.a, color.a);
}`;
};

const createWebgpuSource = (adjustment) => {
  const uniformName = toUniformName(adjustment.id);

  return `struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

struct ShaderUniforms {
  uProgress: f32,
  uResolution: vec2<f32>,
  ${uniformName}: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> shaderUniforms: ShaderUniforms;

struct VSOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
  var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
  position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
  position.y =
    position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) -
    gfu.uOutputTexture.z;
  let uv = aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
  return VSOutput(vec4(position, 0.0, 1.0), uv);
}

@fragment
fn mainFragment(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let color = textureSample(uTexture, uSampler, uv);
  if (color.a <= 0.0) {
    return color;
  }

  var rgb = color.rgb / color.a;
  ${adjustment.webgpuOperation}
  return vec4<f32>(
    clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * color.a,
    color.a
  );
}`;
};

export const createInitialBackgroundShaderAdjustments = () => {
  return Object.fromEntries(
    BACKGROUND_SHADER_ADJUSTMENTS.map((adjustment) => [
      adjustment.id,
      {
        enabled: false,
        value: adjustment.defaultValue,
      },
    ]),
  );
};

export const getBackgroundShaderAdjustment = (adjustmentId) => {
  return BACKGROUND_SHADER_ADJUSTMENTS_BY_ID[adjustmentId];
};

export const orderBackgroundShaderAdjustmentFilters = (filters) => {
  const otherFilters = [];
  const filtersByAdjustmentId = Object.fromEntries(
    BACKGROUND_SHADER_ADJUSTMENTS.map((adjustment) => [adjustment.id, []]),
  );

  for (const filter of filters) {
    const adjustment = BACKGROUND_SHADER_ADJUSTMENTS_BY_FILTER_ID[filter?.id];
    if (!adjustment || filter.type !== "shader") {
      otherFilters.push(filter);
      continue;
    }

    filtersByAdjustmentId[adjustment.id].push(filter);
  }

  const orderedFilters = [...otherFilters];
  for (const adjustment of BACKGROUND_SHADER_ADJUSTMENTS) {
    orderedFilters.push(...filtersByAdjustmentId[adjustment.id]);
  }

  return orderedFilters;
};

export const normalizeBackgroundShaderAdjustmentValue = (
  adjustmentId,
  value,
) => {
  const adjustment = getBackgroundShaderAdjustment(adjustmentId);
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return adjustment.defaultValue;
  }

  return Math.max(adjustment.min, Math.min(adjustment.max, parsedValue));
};

export const createBackgroundShaderAdjustmentFilter = (adjustmentId, value) => {
  const adjustment = getBackgroundShaderAdjustment(adjustmentId);
  const normalizedValue = normalizeBackgroundShaderAdjustmentValue(
    adjustmentId,
    value,
  );

  return {
    id: adjustment.filterId,
    type: "shader",
    parameters: {
      [adjustment.id]: normalizedValue,
    },
    source: {
      webgl: {
        fragment: createWebglFragmentSource(adjustment),
      },
      webgpu: {
        source: createWebgpuSource(adjustment),
      },
    },
  };
};

export const getBackgroundShaderAdjustmentValue = (filters, adjustmentId) => {
  if (!Array.isArray(filters)) {
    return undefined;
  }

  const adjustment = getBackgroundShaderAdjustment(adjustmentId);
  const filter = filters.find(
    (candidate) =>
      candidate?.id === adjustment.filterId && candidate.type === "shader",
  );
  if (!filter) {
    return undefined;
  }

  return normalizeBackgroundShaderAdjustmentValue(
    adjustmentId,
    filter.parameters?.[adjustment.id],
  );
};
