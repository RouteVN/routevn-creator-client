export const AUDIO_TIMELINE_LANE_HEIGHT_PX = 126;
export const AUDIO_TIMELINE_DRAG_STEP_MS = 10;

export const normalizeAudioStartDelayMs = (value, fallback = 0) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsedValue));
};

export const resolveAudioSoundDurationMs = (sound = {}, resource = {}) => {
  const resourceDurationSeconds = Math.max(0, Number(resource?.duration) || 0);
  const startAtSeconds = Math.max(0, Number(sound.startAt) || 0);
  const endAtSeconds =
    sound.endAt !== undefined && sound.endAt !== null
      ? Math.max(startAtSeconds, Number(sound.endAt) || 0)
      : resourceDurationSeconds;
  const playbackRate = Number(sound.playbackRate) || 1;

  return Math.max(
    0,
    Math.round(((endAtSeconds - startAtSeconds) / playbackRate) * 1000),
  );
};

export const formatAudioDurationMs = (durationMs) => {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export const sortAudioSoundsByStartDelay = (sounds = []) => {
  sounds.sort((left, right) => {
    return (
      normalizeAudioStartDelayMs(left.startDelayMs) -
      normalizeAudioStartDelayMs(right.startDelayMs)
    );
  });
};

export const resolveAudioInsertionTiming = ({
  sounds = [],
  index = sounds.length,
  sound,
  resourceById = new Map(),
} = {}) => {
  const insertIndex = Math.max(0, Math.min(index, sounds.length));
  const previousSound = sounds[insertIndex - 1];
  const startDelayMs = previousSound
    ? normalizeAudioStartDelayMs(previousSound.startDelayMs) +
      resolveAudioSoundDurationMs(
        previousSound,
        resourceById.get(previousSound.resourceId),
      )
    : 0;
  const durationMs = resolveAudioSoundDurationMs(
    sound,
    resourceById.get(sound.resourceId),
  );
  const nextSound = sounds[insertIndex];
  const nextStartDelayMs = nextSound
    ? normalizeAudioStartDelayMs(nextSound.startDelayMs)
    : startDelayMs + durationMs;

  return {
    startDelayMs,
    shiftMs: Math.max(0, startDelayMs + durationMs - nextStartDelayMs),
  };
};

export const createAudioTimelineLayout = ({
  sounds = [],
  resourceById = new Map(),
  timelineDurationMs = 0,
} = {}) => {
  const entries = sounds
    .map((sound, sourceIndex) => {
      const startDelayMs = normalizeAudioStartDelayMs(sound.startDelayMs);
      const durationMs = resolveAudioSoundDurationMs(
        sound,
        resourceById.get(sound.resourceId),
      );
      return {
        sound,
        sourceIndex,
        startDelayMs,
        durationMs,
        endMs: startDelayMs + durationMs,
        visualEndMs: startDelayMs + Math.max(durationMs, 1000),
      };
    })
    .sort((left, right) => {
      return (
        left.startDelayMs - right.startDelayMs ||
        left.sourceIndex - right.sourceIndex
      );
    });

  const channelDurationMs = entries.reduce((durationMs, entry) => {
    return Math.max(durationMs, entry.endMs);
  }, 0);
  const fallbackTimelineDurationMs = entries.reduce((durationMs, entry) => {
    return Math.max(
      durationMs,
      entry.startDelayMs + Math.max(entry.durationMs, 1000),
    );
  }, 0);
  const resolvedTimelineDurationMs = Math.max(
    1,
    normalizeAudioStartDelayMs(timelineDurationMs),
    channelDurationMs,
    fallbackTimelineDurationMs,
  );
  const laneEndTimes = [];

  const laidOutSounds = entries.map((entry) => {
    let laneIndex = laneEndTimes.findIndex(
      (laneEndMs) => laneEndMs <= entry.startDelayMs,
    );
    if (laneIndex === -1) {
      laneIndex = laneEndTimes.length;
      laneEndTimes.push(entry.visualEndMs);
    } else {
      laneEndTimes[laneIndex] = entry.visualEndMs;
    }

    const visualDurationMs = Math.max(entry.durationMs, 1000);
    return {
      ...entry,
      laneIndex,
      leftPercent: (
        (entry.startDelayMs / resolvedTimelineDurationMs) *
        100
      ).toFixed(4),
      widthPercent: (
        (visualDurationMs / resolvedTimelineDurationMs) *
        100
      ).toFixed(4),
      topPx: laneIndex * AUDIO_TIMELINE_LANE_HEIGHT_PX,
    };
  });

  const laneCount = Math.max(1, laneEndTimes.length);
  return {
    sounds: laidOutSounds,
    channelDurationMs,
    timelineDurationMs: resolvedTimelineDurationMs,
    laneCount,
    timelineHeightPx: laneCount * AUDIO_TIMELINE_LANE_HEIGHT_PX,
  };
};

export const resolveDraggedAudioStartDelayMs = ({
  originStartDelayMs = 0,
  originClientX = 0,
  clientX = 0,
  timelineDurationMs = 0,
  timelineWidthPx = 0,
} = {}) => {
  if (timelineWidthPx <= 0 || timelineDurationMs <= 0) {
    return normalizeAudioStartDelayMs(originStartDelayMs);
  }

  const deltaMs =
    ((clientX - originClientX) / timelineWidthPx) * timelineDurationMs;
  const nextStartDelayMs =
    Math.round(
      (normalizeAudioStartDelayMs(originStartDelayMs) + deltaMs) /
        AUDIO_TIMELINE_DRAG_STEP_MS,
    ) * AUDIO_TIMELINE_DRAG_STEP_MS;
  return Math.max(0, nextStartDelayMs);
};
