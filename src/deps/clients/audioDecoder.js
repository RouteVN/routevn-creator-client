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
  try {
    // Native decoding can detach its input, including on failure. Retain the
    // original bytes for the fallback and for storing the unchanged upload.
    return await audioContext.decodeAudioData(arrayBuffer.slice(0));
  } catch (nativeError) {
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = await getOggDecoder(bytes);
    if (!decoder) throw nativeError;

    try {
      await decoder.ready;
      const { channelData, samplesDecoded, sampleRate, errors } =
        await decoder.decodeFile(bytes);
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
