import { describe, expect, it, vi } from "vitest";
import { startCanvasVideoRecording } from "../../src/deps/clients/canvasVideoRecorder.js";

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
        recorderInstance = this;
      }

      start(timeslice) {
        this.state = "recording";
        this.timeslice = timeslice;
      }

      stop() {
        this.state = "inactive";
        this.ondataavailable({
          data: new Blob(["video-data"], { type: this.mimeType }),
        });
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
    expect(video.type).toBe("video/webm;codecs=vp8");
    expect(await video.text()).toBe("video-data");
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
