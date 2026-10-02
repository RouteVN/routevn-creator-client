import {
  createIOSAudioOutput,
  isMediaActivationRequired,
} from "./audioOutput.js";

// RouteGraphics accepts a host-provided context through configureAudioRuntime.
// Keep native nodes and timing, but send its final mix to iOS media playback.
export const createIOSGraphicsAudioOutput = ({
  runtime,
  documentTarget = globalThis.document,
}) => {
  const context = runtime.graphicsRuntime.context;
  let output;
  let silence;
  // Counts preview sessions, so work from a closed one cannot start or stop
  // the sink for the next one.
  let session = 0;

  // One media sink across previews. Once it has started, WebKit lets it start
  // again without a tap, so closing a preview pauses it instead of replacing
  // it. A refused start waits for the next tap.
  const ensureOutput = () => {
    output ??= createIOSAudioOutput(context, {
      documentTarget,
      subscribeActivity: runtime.subscribeActivity,
      retryOnActivation: true,
    });
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

  const stopSilence = () => {
    silence?.stop();
    silence?.disconnect();
    silence = undefined;
  };

  // Replace a sink that failed for any reason other than a missing gesture.
  const discardOutput = () => {
    output?.close();
    output = undefined;
    stopSilence();
  };

  const close = () => {
    session += 1;
    // Pause the media sink before stopping its producers.
    output?.pause();
    stopSilence();
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
      session += 1;
      const currentSession = session;
      const currentOutput = ensureOutput();
      try {
        if (context.state === "suspended") await context.resume();
        if (currentSession !== session) return;
        await currentOutput.resume();
      } catch (error) {
        if (currentSession !== session) return;
        // The sink keeps waiting and starts on the next tap.
        if (isMediaActivationRequired(error)) return;
        discardOutput();
        throw error;
      }
    },

    close,

    dispose() {
      session += 1;
      discardOutput();
    },
  };
};
