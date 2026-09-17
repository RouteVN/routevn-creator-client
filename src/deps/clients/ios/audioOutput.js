// iOS 16 Web Audio uses ambient output even when the native shell requests
// media playback. Route its signal through an audio element instead.
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

  const playMedia = async () => {
    if (!active || closed || !wantsPlayback) return;
    try {
      await element.play();
    } catch (error) {
      if (active && wantsPlayback && !closed) throw error;
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
      element.pause();
    },

    close() {
      if (closed) return;
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
