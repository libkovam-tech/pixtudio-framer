# Minimal component plan for PIXTUDIO Quantization Recorder

This is the first-pass target for a reduced custom `ffmpeg.wasm` core.

## Export pipeline we need to support

- input video: PNG sequence
- optional input audio: browser-normalized WAV/PCM
- output video: MP4
- video codec: H.264 via `libx264`
- audio codec: AAC

## Keep

### External libraries

- `libx264`

### Encoders

- `libx264`
- `aac`

### Decoders

- `png`
- `pcm_s16le`
- `pcm_s24le`
- `pcm_s32le`
- `pcm_f32le`

These PCM variants make the first-pass WAV route less brittle.

### Demuxers

- `concat`
- `wav`
- `png_pipe` (optional safety net for image input handling)
- `image2` (optional safety net)

### Muxers

- `mp4`

### Protocols

- `file`

### Filters

- `fps`
- `scale`
- `format`
- `afade`
- `aresample`
- `aformat`

### Parsers / misc

- `png`

## Remove

### Video stack we no longer need

- `libvpx`
- `vp8`
- `vp9`
- `webm`
- `webp`
- `theora`
- `x265`
- av1-related libs/codecs

### Audio stack we no longer want inside ffmpeg

Everything except WAV/PCM decode and AAC encode.

That means the browser, not ffmpeg, should normalize user-selected audio into a
simple WAV buffer before export.

### Subtitles / text rendering

- `libass`
- `freetype`
- `harfbuzz`
- `fribidi`

### Network protocols

Anything not required for local in-memory file processing.

## Rationale

The fastest way to meaningfully reduce `ffmpeg-core.wasm` is:

1. start from `--disable-everything`
2. enable only the exact components above
3. remove builder stages for libraries that are no longer referenced

This follows the guidance from the official `ffmpeg.wasm` custom core docs.
