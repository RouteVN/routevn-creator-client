export const isAudioAvailable = (windowTarget = globalThis.window) =>
  Boolean(windowTarget?.AudioContext ?? windowTarget?.webkitAudioContext);

export const createAudioUnavailableError = () => {
  const error = new Error("Web Audio is not available");
  error.name = "AudioUnavailableError";
  return error;
};

export const isAudioUnavailableError = (error) =>
  error?.name === "AudioUnavailableError";

// Route Graphics creates its root audio channels even for an empty scene.
// The graphics service omits unavailable sounds; these nodes let those empty
// channels and interaction sounds remain silent without a Web Audio context.
export const createSilentGraphicsAudioRuntime = () => {
  const parameter = () => ({
    value: 0,
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
    cancelAndHoldAtTime() {},
  });
  const node = () => ({
    gain: parameter(),
    pan: parameter(),
    playbackRate: parameter(),
    connect() {},
    disconnect() {},
    start() {},
    stop() {},
  });
  const context = {
    state: "running",
    get currentTime() {
      return performance.now() / 1000;
    },
    destination: node(),
    createGain: node,
    createStereoPanner: node,
    createBufferSource: node,
    resume: async () => {},
  };
  return {
    context,
    nowMs: () => Date.now(),
    setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimeout: (id) => globalThis.clearTimeout(id),
    setInterval: (callback, delay) => globalThis.setInterval(callback, delay),
    clearInterval: (id) => globalThis.clearInterval(id),
    queueMicrotask: (callback) => globalThis.queueMicrotask(callback),
  };
};
