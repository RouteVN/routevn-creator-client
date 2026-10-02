import { isMediaActivationRequired } from "../../../internal/errorDetails.js";
import { createIOSAudioOutput } from "./audioOutput.js";

// RouteGraphics accepts a host-provided context through configureAudioRuntime.
// Keep native nodes and timing, but send its final mix to iOS media playback.
//
// One media sink serves every preview. Once it has started, WebKit lets it
// start again without a tap, so closing a preview pauses it instead of
// replacing it. A refused start waits for the next tap. Any other failure
// replaces the sink: resume() rejects with it, and one on a tap goes to
// onError.
export const createIOSGraphicsAudioOutput = ({
  runtime,
  documentTarget = globalThis.document,
  onError,
}) => {
  const context = runtime.graphicsRuntime.context;
  let output;
  let silence;

  const discardOutput = () => {
    // Pause the media sink before stopping its producer.
    output?.close();
    output = undefined;
    silence?.stop();
    silence?.disconnect();
    silence = undefined;
  };

  const ensureOutput = () => {
    if (output) return output;
    const nextOutput = createIOSAudioOutput(context, {
      documentTarget,
      subscribeActivity: runtime.subscribeActivity,
      retryOnActivation: true,
      onError: (error) => {
        if (output !== nextOutput) return;
        discardOutput();
        onError?.(error);
      },
    });
    output = nextOutput;
    // Keep producing zero-valued frames, also while paused between previews.
    // An idle WebKit media stream can otherwise repeat its last buffered
    // audio samples when it starts again.
    silence = context.createConstantSource();
    silence.offset.value = 0;
    silence.connect(output.destination);
    silence.start();
    return output;
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
        await currentOutput.resume();
      } catch (error) {
        if (isMediaActivationRequired(error)) return;
        if (output === currentOutput) discardOutput();
        throw error;
      }
    },

    close() {
      output?.pause();
    },
  };
};
