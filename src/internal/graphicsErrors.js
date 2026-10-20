const MAX_CAUSES = 3;

// What Pixi, under Route Graphics, throws when the device or its web view
// cannot give the app a WebGL context: a context that could not be created, no
// WebGL at all (Pixi then reaches for a canvas renderer it does not have), or
// no renderer left to try. Route Graphics offers WebGL and WebGPU only, so
// there is no other renderer to fall back to.
// A context that could not be created is the one failure that can pass: Pixi
// has already found WebGL, so the device may only be refusing for the moment.
// When Pixi finds no WebGL, it remembers that for the whole session.
const CONTEXT_CREATION_MESSAGES = [/does not support webgl/];

const GRAPHICS_UNAVAILABLE_MESSAGES = [
  ...CONTEXT_CREATION_MESSAGES,
  /canvasrenderer is not yet implemented/,
  /no available renderer for the current environment/,
];

const readProperty = (value, name) => {
  try {
    return value?.[name];
  } catch {
    return undefined;
  }
};

const describesGraphicsFailure = (error, messages) => {
  // Tauri rejects with strings, other realms with objects that are not Errors.
  const message = readProperty(error, "message") ?? error;
  if (typeof message !== "string") {
    return false;
  }
  const text = message.toLowerCase();
  return messages.some((pattern) => pattern.test(text));
};

const someErrorInChain = (error, test) => {
  const seen = new Set();
  let current = error;
  while (
    current !== undefined &&
    current !== null &&
    !seen.has(current) &&
    seen.size <= MAX_CAUSES
  ) {
    if (test(current)) {
      return true;
    }
    seen.add(current);
    current = readProperty(current, "cause");
  }
  return false;
};

// Whether graphics could not start because the device has no usable WebGL.
// That is a limit of the device or its web view, not a bug in the app: tell
// the user instead of reporting an error.
export const isGraphicsUnavailableError = (error) =>
  someErrorInChain(error, (current) =>
    describesGraphicsFailure(current, GRAPHICS_UNAVAILABLE_MESSAGES),
  );

// Whether graphics could not start because a WebGL context could not be
// created, which may be temporary. Starting again can succeed.
export const isGraphicsContextCreationError = (error) =>
  someErrorInChain(error, (current) =>
    describesGraphicsFailure(current, CONTEXT_CREATION_MESSAGES),
  );
