These two-second stereo test tones were generated with FFmpeg; they contain no
third-party recordings.

```sh
ffmpeg -f lavfi -i 'sine=frequency=440:duration=2:sample_rate=48000' -ac 2 -c:a libvorbis tone-vorbis.ogg
ffmpeg -f lavfi -i 'sine=frequency=660:duration=2:sample_rate=48000' -ac 2 -c:a libopus tone-opus.ogg
```
