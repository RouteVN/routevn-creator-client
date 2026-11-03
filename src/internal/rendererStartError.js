const RENDERER_START_FAILED = "renderer_start_failed";

// A failure to make or start the graphics context of an off-screen renderer,
// as opposed to a failure drawing something on one. A renderer that cannot
// start will not start for the next drawing either.
export const createRendererStartError = (cause) => {
  const error = new Error("Unable to start the off-screen renderer.", {
    cause,
  });
  error.code = RENDERER_START_FAILED;
  return error;
};

export const isRendererStartError = (error) =>
  error?.code === RENDERER_START_FAILED;
