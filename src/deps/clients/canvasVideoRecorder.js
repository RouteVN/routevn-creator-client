const CANVAS_VIDEO_MIME_TYPES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=h264",
  "video/mp4",
];

const selectCanvasVideoMimeType = (MediaRecorderConstructor) => {
  if (typeof MediaRecorderConstructor.isTypeSupported !== "function") {
    return undefined;
  }

  return CANVAS_VIDEO_MIME_TYPES.find((mimeType) =>
    MediaRecorderConstructor.isTypeSupported(mimeType),
  );
};

const stopStreamTracks = (stream) => {
  for (const track of stream.getTracks?.() ?? []) {
    track.stop();
  }
};

export const startCanvasVideoRecording = ({
  canvas,
  frameRate = 60,
  MediaRecorderConstructor,
} = {}) => {
  const Recorder = MediaRecorderConstructor ?? globalThis.MediaRecorder;
  if (!canvas || typeof canvas.captureStream !== "function") {
    throw new Error("Canvas video capture is unavailable.");
  }
  if (typeof Recorder !== "function") {
    throw new Error("Video recording is unavailable.");
  }

  const stream = canvas.captureStream(frameRate);
  const mimeType = selectCanvasVideoMimeType(Recorder);
  const recorder = mimeType
    ? new Recorder(stream, { mimeType })
    : new Recorder(stream);
  const chunks = [];
  let settled = false;
  let resolveRecording;
  let rejectRecording;
  const recording = new Promise((resolve, reject) => {
    resolveRecording = resolve;
    rejectRecording = reject;
  });

  const cleanup = () => {
    stopStreamTracks(stream);
    recorder.ondataavailable = undefined;
    recorder.onerror = undefined;
    recorder.onstop = undefined;
  };
  const reject = (error) => {
    if (settled) {
      return;
    }
    settled = true;
    cleanup();
    rejectRecording(error);
  };

  recorder.ondataavailable = (event) => {
    if (event.data?.size > 0) {
      chunks.push(event.data);
    }
  };
  recorder.onerror = (event) => {
    reject(event.error ?? new Error("Canvas video recording failed."));
  };
  recorder.onstop = () => {
    if (settled) {
      return;
    }
    settled = true;
    const video = new Blob(chunks, {
      type: recorder.mimeType || mimeType || "video/webm",
    });
    cleanup();

    if (video.size === 0) {
      rejectRecording(new Error("Canvas video recording is empty."));
      return;
    }
    resolveRecording(video);
  };

  try {
    recorder.start(100);
  } catch (error) {
    settled = true;
    cleanup();
    throw error;
  }

  let stopRequested = false;
  return {
    stop() {
      if (!stopRequested) {
        stopRequested = true;
        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch (error) {
            reject(error);
          }
        }
      }
      return recording;
    },
  };
};
