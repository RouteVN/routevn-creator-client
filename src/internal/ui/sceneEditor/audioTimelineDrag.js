import { fromEvent, tap } from "rxjs";

export const mountAudioTimelineDragSubscriptions = (deps) => {
  const subscriptions = [
    fromEvent(window, "pointermove", { passive: false }).pipe(
      tap((event) =>
        deps.handlers.handleWindowPointerMove(deps, { _event: event }),
      ),
    ),
    fromEvent(window, "pointerup", { passive: false }).pipe(
      tap((event) =>
        deps.handlers.handleWindowPointerUp(deps, { _event: event }),
      ),
    ),
    fromEvent(window, "pointercancel", { passive: false }).pipe(
      tap((event) =>
        deps.handlers.handleWindowPointerCancel(deps, { _event: event }),
      ),
    ),
  ];
  const activeSubscriptions = subscriptions.map((stream) => stream.subscribe());

  return () => {
    activeSubscriptions.forEach((subscription) => subscription.unsubscribe());
  };
};

export const startAudioTimelineDrag = (deps, event) => {
  if (event.button !== 0) {
    return false;
  }

  const timelineTrack = event.currentTarget.closest("[data-timeline-track]");
  const timelineRect = timelineTrack?.getBoundingClientRect?.();
  const timelineDurationMs = Number(timelineTrack?.dataset.timelineDurationMs);
  if (!timelineRect?.width || !timelineDurationMs) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.closest("[data-sound-id]")?.focus?.();
  deps.store.startSoundDrag({
    channelId: event.currentTarget.dataset.channelId,
    soundId: event.currentTarget.dataset.soundId,
    pointerId: event.pointerId,
    clientX: event.clientX,
    timelineDurationMs,
    timelineWidthPx: timelineRect.width,
  });
  deps.render();
  return true;
};

export const moveAudioTimelineDrag = (deps, event) => {
  const drag = deps.store.selectSoundDrag();
  if (!drag || drag.pointerId !== event.pointerId) {
    return false;
  }

  event.preventDefault();
  deps.store.updateSoundDrag({
    pointerId: event.pointerId,
    clientX: event.clientX,
  });
  deps.render();
  return true;
};

export const finishAudioTimelineDrag = (deps, event) => {
  const drag = deps.store.selectSoundDrag();
  if (!drag || drag.pointerId !== event.pointerId) {
    return false;
  }

  event.preventDefault();
  deps.store.finishSoundDrag({
    pointerId: event.pointerId,
    suppressChannelClickUntil: event.timeStamp + 250,
  });
  deps.render();
  return true;
};
