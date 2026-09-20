import {
  runAsyncOperation,
  getAssetTimeoutMs,
} from "../../internal/asyncOperation.js";

const getOggDecoder = async (bytes) => {
  // Inspect the container/identification packet: native pickers and stored URLs
  // do not always supply an OGG MIME type or filename extension.
  if (
    bytes.length < 28 ||
    new DataView(bytes.buffer, bytes.byteOffset).getUint32(0) !== 0x4f676753
  ) {
    return undefined;
  }

  const packetStart = 27 + bytes[26];
  const header = new TextDecoder().decode(
    bytes.subarray(packetStart, packetStart + 8),
  );
  if (header.startsWith("\x01vorbis")) {
    const { OggVorbisDecoder } = await import(
      "@wasm-audio-decoders/ogg-vorbis"
    );
    return new OggVorbisDecoder();
  }
  if (header === "OpusHead") {
    const { OggOpusDecoder } = await import("ogg-opus-decoder");
    return new OggOpusDecoder();
  }
  return undefined;
};

export const decodeAudioBuffer = async ({ audioContext, arrayBuffer }) => {
  const timeoutMs = getAssetTimeoutMs({ size: arrayBuffer.byteLength });
  try {
    // Native decoding can detach its input, including on failure. Retain the
    // original bytes for the fallback and for storing the unchanged upload.
    return await runAsyncOperation(
      () => audioContext.decodeAudioData(arrayBuffer.slice(0)),
      { timeoutMs, label: "Decode audio" },
    );
  } catch (nativeError) {
    if (nativeError.name === "TimeoutError") throw nativeError;
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = await runAsyncOperation(() => getOggDecoder(bytes), {
      timeoutMs,
      label: "Initialize OGG decoder",
      onLateResolve: (decoder) => decoder?.free(),
    });
    if (!decoder) throw nativeError;

    try {
      await runAsyncOperation(() => decoder.ready, {
        timeoutMs,
        label: "Prepare OGG decoder",
      });
      const { channelData, samplesDecoded, sampleRate, errors } =
        await runAsyncOperation(() => decoder.decodeFile(bytes), {
          timeoutMs,
          label: "Decode OGG audio",
        });
      if (!samplesDecoded || channelData.length === 0 || errors.length > 0) {
        throw new Error("Unable to decode OGG audio.");
      }

      const buffer = audioContext.createBuffer(
        channelData.length,
        samplesDecoded,
        sampleRate,
      );
      channelData.forEach((channel, index) => {
        buffer.getChannelData(index).set(channel.subarray(0, samplesDecoded));
      });
      return buffer;
    } finally {
      decoder.free();
    }
  }
};
