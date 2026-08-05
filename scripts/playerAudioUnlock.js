const PLAYER_AUDIO_UNLOCK_EVENTS = ["pointerdown", "touchend", "keydown"];

export const installPlayerAudioUnlock = ({
  eventTarget = globalThis.document,
  resumeAudio,
} = {}) => {
  if (!eventTarget || typeof resumeAudio !== "function") {
    return () => {};
  }

  const handleInteraction = () => {
    void Promise.resolve(resumeAudio()).catch(() => {});
  };

  PLAYER_AUDIO_UNLOCK_EVENTS.forEach((eventName) => {
    eventTarget.addEventListener(eventName, handleInteraction, {
      capture: true,
    });
  });

  return () => {
    PLAYER_AUDIO_UNLOCK_EVENTS.forEach((eventName) => {
      eventTarget.removeEventListener(eventName, handleInteraction, {
        capture: true,
      });
    });
  };
};
