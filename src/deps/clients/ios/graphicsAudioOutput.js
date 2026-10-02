import { createIOSAudioOutput } from "./audioOutput.js";

// RouteGraphics accepts a host-provided context through configureAudioRuntime.
// Keep native nodes and timing, but send its final mix to iOS media playback.
export const createIOSGraphicsAudioOutput = ({
  runtime,
  documentTarget = globalThis.document,
}) => {
  const context = runtime.graphicsRuntime.context;
  // One media sink for the app session. WebKit lets it start on its own only
  // after it has started inside a gesture, so a new sink per preview would
  // need another tap; closing a preview pauses it instead.
  const output = createIOSAudioOutput(context, {
    documentTarget,
    subscribeActivity: runtime.subscribeActivity,
  });
  let silence;

  const ensureOutput = () => {
    if (!silence) {
      // Keep producing zero-valued frames between sounds. An idle WebKit
      // media stream can otherwise repeat its last buffered audio samples.
      silence = context.createConstantSource();
      silence.offset.value = 0;
      silence.connect(output.destination);
      silence.start();
    }
    return output;
  };

  const close = () => {
    // Pause the media sink before stopping its producers.
    output.pause();
    silence?.stop();
    silence?.disconnect();
    silence = undefined;
  };

  const outputContext = new Proxy(context, {
    get(target, property) {
      if (property === "destination") return ensureOutput().destination;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return {
    graphicsRuntime: {
      ...runtime.graphicsRuntime,
      context: outputContext,
    },

    async resume() {
      ensureOutput();
      try {
        if (context.state === "suspended") await context.resume();
        await output.resume();
      } catch (error) {
        close();
        throw error;
      }
    },

    close,
  };
};
