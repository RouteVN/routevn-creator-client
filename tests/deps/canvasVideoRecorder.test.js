import { describe, expect, it, vi } from "vitest";
import { startCanvasVideoRecording } from "../../src/deps/clients/canvasVideoRecorder.js";

// Long enough to pass for a video file with frames in it.
const VIDEO_DATA = "video-data".repeat(10);

const createFakeMediaRecorder = (finalData) =>
  class {
    static isTypeSupported = () => true;

    constructor(_stream, options) {
      this.mimeType = options.mimeType;
      this.state = "inactive";
    }

    start() {
      this.state = "recording";
    }

    requestData() {}

    stop() {
      this.state = "inactive";
      this.ondataavailable({
        data: new Blob([finalData], { type: this.mimeType }),
      });
      this.onstop();
    }
  };

describe("canvasVideoRecorder", () => {
  it("records the canvas stream with a supported video format", async () => {
    const stopTrack = vi.fn();
    const stream = {
      getTracks: vi.fn(() => [{ stop: stopTrack }]),
    };
    const captureStream = vi.fn(() => stream);
    let recorderInstance;

    class FakeMediaRecorder {
      static isTypeSupported = vi.fn(
        (mimeType) => mimeType === "video/webm;codecs=vp8",
      );

      constructor(recordingStream, options) {
        this.stream = recordingStream;
        this.mimeType = options.mimeType;
        this.state = "inactive";
        this.requestDataCalls = 0;
        recorderInstance = this;
      }

      start(timeslice) {
        this.state = "recording";
        this.timeslice = timeslice;
      }

      requestData() {
        this.requestDataCalls += 1;
        this.ondataavailable({
          data: new Blob([VIDEO_DATA], { type: this.mimeType }),
        });
      }

      stop() {
        this.state = "inactive";
        this.onstop();
      }
    }

    const recording = startCanvasVideoRecording({
      canvas: { captureStream },
      frameRate: 30,
      MediaRecorderConstructor: FakeMediaRecorder,
    });
    const video = await recording.stop();

    expect(captureStream).toHaveBeenCalledWith(30);
    expect(recorderInstance.stream).toBe(stream);
    expect(recorderInstance.mimeType).toBe("video/webm;codecs=vp8");
    expect(recorderInstance.timeslice).toBe(100);
    expect(recorderInstance.requestDataCalls).toBe(1);
    expect(video.type).toBe("video/webm;codecs=vp8");
    expect(await video.text()).toBe(VIDEO_DATA);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("rejects a recording that holds no frames", async () => {
    const stopTrack = vi.fn();
    // With no frames to encode, a recorder can still write the bytes that
    // close the file when it stops.
    const recording = startCanvasVideoRecording({
      canvas: {
        captureStream: () => ({ getTracks: () => [{ stop: stopTrack }] }),
      },
      MediaRecorderConstructor: createFakeMediaRecorder(
        new Uint8Array([0x1c, 0x53, 0xbb, 0x6b, 0x80]),
      ),
    });

    await expect(recording.stop()).rejects.toThrow(
      "Canvas video recording is empty.",
    );
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("rejects canvas video capture when recording APIs are unavailable", () => {
    expect(() =>
      startCanvasVideoRecording({
        canvas: {},
        MediaRecorderConstructor: class {},
      }),
    ).toThrow("Canvas video capture is unavailable.");

    expect(() =>
      startCanvasVideoRecording({
        canvas: { captureStream: vi.fn() },
        MediaRecorderConstructor: {},
      }),
    ).toThrow("Video recording is unavailable.");
  });
});
