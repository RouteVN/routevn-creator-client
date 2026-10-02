// Gestures that let WebKit start a media element.
const ACTIVATION_EVENTS = ["pointerdown", "touchend", "keydown"];

const ACTIVATION_LISTENER_OPTIONS = { capture: true };

const isActivationRequired = (error) => error?.name === "NotAllowedError";

// iOS 16 Web Audio uses ambient output even when the native shell requests
// media playback. Route its signal through an audio element instead.
//
// WebKit can refuse to start that element outside a user gesture
// (NotAllowedError), even when the web view allows autoplay; iPadOS 27 does.
// After the element has started inside a gesture, later starts are allowed.
// So the element starts on the first tap or key press, even before anything
// needs to play, and a refused start waits for the next one.
export const createIOSAudioOutput = (
  context,
  { documentTarget = globalThis.document, subscribeActivity } = {},
) => {
  const destination = context.createMediaStreamDestination();
  const element = documentTarget.createElement("audio");
  element.hidden = true;
  element.srcObject = destination.stream;
  documentTarget.body.append(element);
  let wantsPlayback = false;
  let closed = false;
  let active = true;

  const stopWaitingForActivation = () => {
    for (const eventName of ACTIVATION_EVENTS) {
      documentTarget.removeEventListener(
        eventName,
        handleActivation,
        ACTIVATION_LISTENER_OPTIONS,
      );
    }
  };

  const waitForActivation = () => {
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
    if (closed) return;
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
      if (isActivationRequired(error)) {
        waitForActivation();
        return;
      }
      if (active && wantsPlayback && !closed) throw error;
    }
    if (!active || !wantsPlayback || closed) element.pause();
  };

  waitForActivation();

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

    // Resolves without playing when WebKit needs a gesture first; the next
    // tap or key press starts playback.
    async resume() {
      if (closed) return;
      wantsPlayback = true;
      await playMedia();
    },

    pause() {
      wantsPlayback = false;
      element.pause();
    },

    close() {
      if (closed) return;
      closed = true;
      stopWaitingForActivation();
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
