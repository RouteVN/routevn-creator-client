import { isMediaActivationRequired } from "../../../internal/errorDetails.js";

// Gestures that let WebKit start a media element. On touch, pointerdown does
// not count as a gesture; pointerup and touchend do.
const ACTIVATION_EVENTS = ["pointerdown", "pointerup", "touchend", "keydown"];
const ACTIVATION_LISTENER_OPTIONS = { capture: true };

// iOS 16 Web Audio uses ambient output even when the native shell requests
// media playback. Route its signal through an audio element instead.
//
// resume() starts the audio context and the element. WebKit can refuse either
// outside a user gesture (NotAllowedError), even when the web view allows
// audio without one; iPadOS 27 does. A refused resume() rejects with that
// error. With retryOnActivation, both start again on the next tap or key
// press while playback is still wanted, and a failure there goes to onError.
// Once the element has started, WebKit lets it start again without a gesture.
export const createIOSAudioOutput = (
  context,
  {
    documentTarget = globalThis.document,
    subscribeActivity,
    retryOnActivation = false,
    onError,
  } = {},
) => {
  const destination = context.createMediaStreamDestination();
  const element = documentTarget.createElement("audio");
  element.hidden = true;
  element.srcObject = destination.stream;
  documentTarget.body.append(element);
  // resume(), pause() and close() each start a new request. A start that
  // settles after a newer request neither reports nor changes anything.
  let request = 0;
  let wantsPlayback = false;
  let closed = false;
  let active = true;
  let waitingForActivation = false;
  let startingFromActivation = false;

  const canPlay = () => wantsPlayback && active && !closed;

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

  // Both calls run before the first await, so a gesture that calls this
  // covers both.
  const startContextAndMedia = () =>
    Promise.all([
      context.state === "suspended" ? context.resume() : undefined,
      element.play(),
    ]);

  const start = async (requestId, startPlayback) => {
    try {
      await startPlayback();
    } catch (error) {
      if (requestId !== request || !canPlay()) return;
      if (isMediaActivationRequired(error) && retryOnActivation) {
        waitForActivation();
      } else {
        stopWaitingForActivation();
      }
      throw error;
    }
    stopWaitingForActivation();
    if (!canPlay()) element.pause();
  };

  // Runs inside the gesture: the start calls must come before any await.
  const handleActivation = () => {
    if (!wantsPlayback || closed) {
      stopWaitingForActivation();
      return;
    }
    // One tap sends several activation events; start once.
    if (!active || startingFromActivation) return;
    startingFromActivation = true;
    start(request, startContextAndMedia)
      .catch((error) => {
        // A refusal keeps waiting for the next tap.
        if (!isMediaActivationRequired(error)) onError?.(error);
      })
      .finally(() => {
        startingFromActivation = false;
      });
  };

  const unsubscribeActivity = subscribeActivity?.(async (value) => {
    active = value;
    if (!active) {
      element.pause();
      return;
    }
    if (!canPlay()) return;
    await start(request, async () => {
      // Wait for the producer before restarting its media stream.
      if (context.state === "suspended") await context.resume();
      await element.play();
    });
  });

  return {
    destination,

    async resume() {
      if (closed) return;
      request += 1;
      wantsPlayback = true;
      // A background resume starts when the app returns to the foreground.
      if (!active) return;
      await start(request, startContextAndMedia);
    },

    pause() {
      request += 1;
      wantsPlayback = false;
      stopWaitingForActivation();
      element.pause();
    },

    close() {
      if (closed) return;
      request += 1;
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
