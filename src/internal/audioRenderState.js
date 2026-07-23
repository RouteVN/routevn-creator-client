const CANONICAL_AUDIO_CHANNELS = [
  { actionKey: "bgm", renderId: "channel:bgm" },
  { actionKey: "voice", renderId: "channel:voice" },
];

export const prepareRenderStateAudioChannelsForGraphics = ({
  renderState,
  presentationState,
}) => {
  if (!Array.isArray(renderState?.audio)) {
    return renderState;
  }

  const channelLoopByRenderId = new Map();
  CANONICAL_AUDIO_CHANNELS.forEach(({ actionKey, renderId }) => {
    const channel = presentationState?.[actionKey];
    if (Array.isArray(channel?.sounds) && typeof channel.loop === "boolean") {
      channelLoopByRenderId.set(renderId, channel.loop);
    }
  });

  if (channelLoopByRenderId.size === 0) {
    return renderState;
  }

  let changed = false;
  const audio = renderState.audio.map((element) => {
    if (
      element?.type !== "audio-channel" ||
      !channelLoopByRenderId.has(element.id)
    ) {
      return element;
    }

    changed = true;
    const children = Array.isArray(element.children)
      ? element.children.map((child) => {
          if (child?.type !== "sound" || child.loop === false) {
            return child;
          }
          return { ...child, loop: false };
        })
      : element.children;

    return {
      ...element,
      loop: channelLoopByRenderId.get(element.id),
      children,
    };
  });

  if (!changed) {
    return renderState;
  }

  return {
    ...renderState,
    audio,
  };
};
