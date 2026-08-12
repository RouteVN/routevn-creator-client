import { generateId } from "../../../internal/id.js";
import { getTransitionFadeKeyframes } from "../../../internal/audioEffectDefinition.js";
import { resolveResourceFileType } from "../../../internal/resourceFileMetadata.js";
import { AUDIO_EFFECT_PROPERTY_CONFIG } from "../audioEffectsEditor.constants.js";
import { selectAudioEffectsEditorPageCopy } from "./audioEffectsEditorPageCopy.js";

const PREVIEW_SOUND_ID = "audio-effect-preview-bgm";
const DEFAULT_AUDIO_VALUES = Object.freeze({
  volume: 100,
  pan: 0,
  playbackRate: 1,
});

const createRenderState = ({ id, audio = [], audioEffects = [] } = {}) => ({
  id,
  elements: [],
  audio,
  audioEffects,
  animations: [],
});

const createSoundNode = (sound, properties = {}) => ({
  id: PREVIEW_SOUND_ID,
  type: "sound",
  src: sound.fileId,
  loop: true,
  ...DEFAULT_AUDIO_VALUES,
  ...properties,
});

const createFadePhase = ({ definition, initialValue, side } = {}) => {
  const keyframes = getTransitionFadeKeyframes(definition, side);
  if (keyframes.length === 0) {
    return undefined;
  }

  const phase = { keyframes: structuredClone(keyframes) };
  if (initialValue !== undefined) {
    phase.initialValue = initialValue;
  }
  return phase;
};

const createTransitionEffect = (definition, occurrenceId) => {
  const volume = {};
  const exit = createFadePhase({ definition, side: "prev" });
  const enter = createFadePhase({
    definition,
    initialValue: 0,
    side: "next",
  });
  if (exit) {
    volume.exit = exit;
  }
  if (enter) {
    volume.enter = enter;
  }

  return {
    id: `audio-effect-preview:${occurrenceId}`,
    type: "audio-transition",
    targetId: PREVIEW_SOUND_ID,
    properties: { volume },
  };
};

const createUpdateEffect = (definition, occurrenceId) => ({
  id: `audio-effect-preview:${occurrenceId}`,
  type: "audio-transition",
  targetId: PREVIEW_SOUND_ID,
  properties: Object.fromEntries(
    Object.entries(definition.tween ?? {}).map(([property, config]) => [
      property,
      {
        update: {
          keyframes: structuredClone(config.keyframes),
        },
      },
    ]),
  ),
});

const getTransitionPersistentValues = (definition) => {
  const keyframes = getTransitionFadeKeyframes(definition, "next");
  if (keyframes.length === 0) {
    return {};
  }

  return { volume: keyframes.at(-1).value };
};

const getUpdatePersistentValues = (definition) =>
  Object.fromEntries(
    Object.entries(definition.tween ?? {}).map(([property, config]) => [
      property,
      config.keyframes.at(-1).value,
    ]),
  );

const getUpdatePreviewInitialValues = (definition) =>
  Object.fromEntries(
    Object.entries(definition.tween ?? {}).map(([property, tween]) => {
      const propertyConfig = AUDIO_EFFECT_PROPERTY_CONFIG[property];
      const defaultValue =
        propertyConfig?.defaultValue ?? DEFAULT_AUDIO_VALUES[property] ?? 0;
      const targetValue = tween.keyframes.at(-1).value;
      if (defaultValue !== targetValue) {
        return [property, defaultValue];
      }

      const alternativeValue = [propertyConfig?.min, propertyConfig?.max].find(
        (value) => value !== undefined && value !== targetValue,
      );
      return [
        property,
        alternativeValue ?? defaultValue + (propertyConfig?.step ?? 1),
      ];
    }),
  );

export const createAudioEffectPreviewStates = ({
  definition,
  incomingSound,
  occurrenceId = generateId(),
  outgoingSound,
  targetSound,
} = {}) => {
  if (definition.type === "transition") {
    return {
      resetState: createRenderState({
        id: `audio-effect-preview-reset:${occurrenceId}`,
        audio: [createSoundNode(outgoingSound)],
      }),
      renderState: createRenderState({
        id: `audio-effect-preview-render:${occurrenceId}`,
        audio: [
          createSoundNode(
            incomingSound,
            getTransitionPersistentValues(definition),
          ),
        ],
        audioEffects: [createTransitionEffect(definition, occurrenceId)],
      }),
    };
  }

  return {
    resetState: createRenderState({
      id: `audio-effect-preview-reset:${occurrenceId}`,
      audio: [
        createSoundNode(targetSound, getUpdatePreviewInitialValues(definition)),
      ],
    }),
    renderState: createRenderState({
      id: `audio-effect-preview-render:${occurrenceId}`,
      audio: [
        createSoundNode(targetSound, getUpdatePersistentValues(definition)),
      ],
      audioEffects: [createUpdateEffect(definition, occurrenceId)],
    }),
  };
};

const loadPreviewSoundAssets = async ({
  graphicsService,
  isActive,
  projectService,
  sounds,
} = {}) => {
  const repositoryState = projectService.getRepositoryState() ?? {};
  const assets = {};

  for (const sound of sounds) {
    const file = await projectService.getFileContent(sound.fileId);
    if (!isActive()) {
      return false;
    }
    assets[sound.fileId] = {
      url: file.url,
      type:
        resolveResourceFileType({
          item: sound,
          files: repositoryState.files,
        }) ??
        file.type ??
        "audio/mpeg",
    };
  }

  await graphicsService.loadAssets(assets);
  return isActive();
};

export const stopAudioEffectPreview = async ({
  graphicsService,
  store,
} = {}) => {
  const frameId = store.selectPreviewPlaybackFrameId();
  if (frameId !== undefined) {
    globalThis.cancelAnimationFrame?.(frameId);
  }
  store.stopPreviewPlayback();
  store.setPreviewPlaybackRequestId({ requestId: undefined });
  store.setPreviewLoading({ loading: false });
  store.setPreviewPlaying({ playing: false });
  if (!store.selectPreviewRuntimeReady()) {
    return;
  }

  await graphicsService.render(
    createRenderState({ id: `audio-effect-preview-stop:${generateId()}` }),
  );
};

const schedulePreviewPlaybackIndicatorFrame = (deps, { requestId } = {}) => {
  const { render, store } = deps;
  const frameId = globalThis.requestAnimationFrame?.((timestamp) => {
    if (store.selectPreviewPlaybackRequestId() !== requestId) {
      return;
    }

    const startedAtMs = store.selectPreviewPlaybackStartedAtMs();
    const durationMs = store.selectPreviewPlaybackDurationMs();
    if (startedAtMs === undefined || durationMs === undefined) {
      return;
    }

    const elapsedMs = Math.max(0, timestamp - startedAtMs);
    const loopEnabled =
      durationMs > 0 && store.selectPreviewLoopEnabled() === true;
    const nextTimeMs = loopEnabled
      ? Math.round(elapsedMs % durationMs)
      : Math.min(durationMs, Math.round(elapsedMs));
    store.setPreviewPlayhead({ timeMs: nextTimeMs });
    render();

    if (loopEnabled || elapsedMs < durationMs) {
      schedulePreviewPlaybackIndicatorFrame(deps, { requestId });
    }
  });

  if (frameId !== undefined) {
    store.setPreviewPlaybackFrameId({ frameId });
  }
};

const renderPreviewStates = async (
  graphicsService,
  states,
  { isActive = () => true } = {},
) => {
  await graphicsService.render(states.resetState);
  if (!isActive()) {
    return false;
  }
  await graphicsService.render(states.renderState);
  return isActive();
};

const restartPreviewPlaybackIndicator = (deps, { requestId } = {}) => {
  const { store } = deps;
  const frameId = store.selectPreviewPlaybackFrameId();
  if (frameId !== undefined) {
    globalThis.cancelAnimationFrame?.(frameId);
  }
  schedulePreviewPlaybackIndicatorFrame(deps, { requestId });
};

const schedulePreviewCompletion = (
  deps,
  { duration, requestId, states } = {},
) => {
  const { appService, graphicsService, i18n, render, store } = deps;
  globalThis.setTimeout(async () => {
    if (store.selectPreviewPlaybackRequestId() !== requestId) {
      return;
    }

    try {
      if (duration > 0 && store.selectPreviewLoopEnabled()) {
        await renderPreviewStates(graphicsService, states);
        if (store.selectPreviewPlaybackRequestId() !== requestId) {
          return;
        }
        store.startPreviewPlayback({
          startedAtMs: globalThis.performance.now(),
          durationMs: duration,
        });
        restartPreviewPlaybackIndicator(deps, { requestId });
        schedulePreviewCompletion(deps, { duration, requestId, states });
      } else {
        await stopAudioEffectPreview(deps);
      }
    } catch (error) {
      console.error(
        "[audioEffectsEditor] Failed to continue audio effect preview.",
        error,
      );
      try {
        await stopAudioEffectPreview(deps);
      } catch {
        // Local playback state has already been stopped.
      }
      appService.showToast({
        message:
          selectAudioEffectsEditorPageCopy(i18n).failedPreviewAudioEffect ??
          "Failed to preview audio effect.",
      });
    }
    render();
  }, duration);
};

export const playAudioEffectPreview = async (deps) => {
  const { graphicsService, projectService, refs, render, store } = deps;
  const preview = store.selectAudioEffectPreview();
  const sounds = [
    preview.outgoingSound,
    preview.incomingSound,
    preview.targetSound,
  ].filter(Boolean);

  const requestId = generateId();
  const isActive = () => store.selectPreviewPlaybackRequestId() === requestId;
  store.setPreviewPlaybackRequestId({ requestId });
  store.setPreviewLoading({ loading: true });
  render();
  try {
    if (!store.selectPreviewRuntimeReady()) {
      await graphicsService.init({
        canvas: refs.audioPreviewCanvas,
        width: 1,
        height: 1,
      });
      if (!isActive()) {
        return;
      }
      store.setPreviewRuntimeReady({ ready: true });
    }

    const assetsLoaded = await loadPreviewSoundAssets({
      graphicsService,
      isActive,
      projectService,
      sounds,
    });
    if (!assetsLoaded) {
      return;
    }
    const states = createAudioEffectPreviewStates({
      definition: store.selectAudioEffectDefinition(),
      outgoingSound: preview.outgoingSound,
      incomingSound: preview.incomingSound,
      targetSound: preview.targetSound,
    });
    const statesRendered = await renderPreviewStates(graphicsService, states, {
      isActive,
    });
    if (!statesRendered) {
      return;
    }
    const duration = store.selectAudioEffectDuration();
    store.startPreviewPlayback({
      startedAtMs: globalThis.performance.now(),
      durationMs: duration,
    });
    store.setPreviewPlaying({ playing: true });
    schedulePreviewPlaybackIndicatorFrame(deps, { requestId });
    schedulePreviewCompletion(deps, {
      duration,
      requestId,
      states,
    });
  } finally {
    if (isActive()) {
      store.setPreviewLoading({ loading: false });
      render();
    }
  }
};
