import { createIOSAudioOutput } from "./audioOutput.js";

// RouteGraphics accepts a host-provided context through configureAudioRuntime.
// Keep native nodes and timing, but send its final mix to iOS media playback.
export const createIOSGraphicsAudioOutput = ({
  runtime,
  documentTarget = globalThis.document,
}) => {
  const context = runtime.graphicsRuntime.context;
  let output;
  let silence;

  const ensureOutput = () => {
    if (!output) {
      output = createIOSAudioOutput(context, {
        documentTarget,
        subscribeActivity: runtime.subscribeActivity,
      });
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
    // Pause and release the media sink before disconnecting its producers.
    output?.close();
    output = undefined;
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
      const currentOutput = ensureOutput();
      try {
        if (context.state === "suspended") await context.resume();
        await currentOutput.resume();
      } catch (error) {
        if (currentOutput !== output) return;
        close();
        throw error;
      }
    },

    close,
  };
};
