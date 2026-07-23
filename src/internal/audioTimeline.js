export const AUDIO_TIMELINE_LANE_HEIGHT_PX = 126;
export const AUDIO_TIMELINE_DRAG_STEP_MS = 10;
export const AUDIO_TIMELINE_SNAP_DISTANCE_PX = 10;
export const AUDIO_TIMELINE_MAX_SNAP_DISTANCE_MS = 250;

export const normalizeAudioStartDelayMs = (value, fallback = 0) => {
  const parsedValue = Number(value);
  if (!Number.isFinite(parsedValue)) {
    return fallback;
  }

  return Math.max(0, Math.round(parsedValue));
};

export const normalizeAudioChannelInterruption = (value) => {
  return value === "loopEnd" ? "loopEnd" : "immediate";
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

export const createAudioTimelineSnapStartDelays = ({
  sounds = [],
  soundId,
  resourceById = new Map(),
} = {}) => {
  const draggedSound = sounds.find((sound) => sound.id === soundId);
  if (!draggedSound) {
    return [0];
  }

  const draggedDurationMs = resolveAudioSoundDurationMs(
    draggedSound,
    resourceById.get(draggedSound.resourceId),
  );
  const snapStartDelaysMs = new Set([0]);

  sounds.forEach((sound) => {
    if (sound.id === soundId) {
      return;
    }

    const startDelayMs = normalizeAudioStartDelayMs(sound.startDelayMs);
    const endMs =
      startDelayMs +
      resolveAudioSoundDurationMs(sound, resourceById.get(sound.resourceId));

    for (const boundaryMs of [startDelayMs, endMs]) {
      snapStartDelaysMs.add(boundaryMs);
      if (boundaryMs >= draggedDurationMs) {
        snapStartDelaysMs.add(boundaryMs - draggedDurationMs);
      }
    }
  });

  return [...snapStartDelaysMs].sort((left, right) => left - right);
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
  snapStartDelaysMs = [],
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
  const normalizedStartDelayMs = Math.max(0, nextStartDelayMs);
  const snapDistanceMs = Math.min(
    AUDIO_TIMELINE_MAX_SNAP_DISTANCE_MS,
    Math.max(
      AUDIO_TIMELINE_DRAG_STEP_MS,
      (timelineDurationMs / timelineWidthPx) * AUDIO_TIMELINE_SNAP_DISTANCE_PX,
    ),
  );
  let snappedStartDelayMs = normalizedStartDelayMs;
  let closestDistanceMs = snapDistanceMs + 1;

  snapStartDelaysMs.forEach((snapStartDelayMs) => {
    const normalizedSnapStartDelayMs =
      normalizeAudioStartDelayMs(snapStartDelayMs);
    const distanceMs = Math.abs(
      normalizedSnapStartDelayMs - normalizedStartDelayMs,
    );
    if (distanceMs < closestDistanceMs) {
      snappedStartDelayMs = normalizedSnapStartDelayMs;
      closestDistanceMs = distanceMs;
    }
  });

  return closestDistanceMs <= snapDistanceMs
    ? snappedStartDelayMs
    : normalizedStartDelayMs;
};
