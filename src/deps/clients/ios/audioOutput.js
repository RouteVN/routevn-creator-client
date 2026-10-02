// Gestures that let WebKit start a media element. On touch, pointerdown does
// not count as a gesture; pointerup and touchend do.
const ACTIVATION_EVENTS = ["pointerdown", "pointerup", "touchend", "keydown"];
const ACTIVATION_LISTENER_OPTIONS = { capture: true };

// play() was refused because it did not run inside a user gesture.
export const isMediaActivationRequired = (error) =>
  error?.name === "NotAllowedError";

// play() was interrupted by pause(); this is not a playback failure.
const isPlaybackInterrupted = (error) => error?.name === "AbortError";

// iOS 16 Web Audio uses ambient output even when the native shell requests
// media playback. Route its signal through an audio element instead.
//
// WebKit can refuse to start that element outside a user gesture
// (NotAllowedError), even when the web view allows audio without one;
// iPadOS 27 does. A refused resume() rejects with that error. With
// retryOnActivation, the element also starts on the next tap or key press
// while playback is still wanted. Once it has started, WebKit lets the same
// element start again without a gesture.
export const createIOSAudioOutput = (
  context,
  {
    documentTarget = globalThis.document,
    subscribeActivity,
    retryOnActivation = false,
  } = {},
) => {
  const destination = context.createMediaStreamDestination();
  const element = documentTarget.createElement("audio");
  element.hidden = true;
  element.srcObject = destination.stream;
  documentTarget.body.append(element);
  let wantsPlayback = false;
  let closed = false;
  let active = true;
  let waitingForActivation = false;

  const stopWaitingForActivation = () => {
    if (!waitingForActivation) return;
    waitingForActivation = false;
    for (const eventName of ACTIVATION_EVENTS) {
      documentTarget.removeEventListener(
        eventName,
        handleActivation,
        ACTIVATION_LISTENER_OPTIONS,
      );
    }
  };

  const waitForActivation = () => {
    if (waitingForActivation || closed) return;
    waitingForActivation = true;
    for (const eventName of ACTIVATION_EVENTS) {
      documentTarget.addEventListener(
        eventName,
        handleActivation,
        ACTIVATION_LISTENER_OPTIONS,
      );
    }
  };

  // Runs inside the gesture: play() must be called before any await.
  const handleActivation = () => {
    if (closed || !wantsPlayback) {
      stopWaitingForActivation();
      return;
    }
    if (!active) return;
    element.play().then(
      () => {
        stopWaitingForActivation();
        if (!active || !wantsPlayback || closed) element.pause();
      },
      () => {},
    );
  };

  const playMedia = async () => {
    if (!active || closed || !wantsPlayback) return;
    try {
      await element.play();
      stopWaitingForActivation();
    } catch (error) {
      if (!active || !wantsPlayback || closed) return;
      if (isPlaybackInterrupted(error)) return;
      if (isMediaActivationRequired(error) && retryOnActivation) {
        waitForActivation();
      }
      throw error;
    }
    if (!active || !wantsPlayback || closed) element.pause();
  };

  const unsubscribeActivity = subscribeActivity?.(async (value) => {
    active = value;
    if (!active) {
      element.pause();
      return;
    }
    if (!wantsPlayback || closed) return;
    // Wait for the producer before restarting its media stream.
    if (context.state === "suspended") await context.resume();
    await playMedia();
  });

  return {
    destination,

    async resume() {
      if (closed) return;
      wantsPlayback = true;
      await playMedia();
    },

    pause() {
      wantsPlayback = false;
      stopWaitingForActivation();
      element.pause();
    },

    close() {
      if (closed) return;
      stopWaitingForActivation();
      closed = true;
      unsubscribeActivity?.();
      wantsPlayback = false;
      element.pause();
      element.srcObject = null;
      for (const track of destination.stream.getTracks()) track.stop();
      destination.disconnect();
      element.remove();
    },
  };
};
