# Custom FFmpeg Core for Quantization Recorder

This folder is the local workshop for preparing a reduced `ffmpeg.wasm` core for
PIXTUDIO's `QuantizationRecorder`.

The current stock `@ffmpeg/core` bundle is too large for Cloudflare Pages
because the generated `ffmpeg-core.wasm` exceeds the 25 MiB per-file limit.

Our goal is to build a custom single-thread core that stays well below the
Cloudflare Pages file limit while keeping the export pipeline stable.

The first ultra-minimal `--disable-everything` attempt proved too brittle for
`libx264`, so the current plan is a pragmatically reduced build: keep FFmpeg's
normal internal plumbing, but avoid large optional areas and extra external
codec stacks.

The target pipeline remains:

- `PNG sequence -> MP4`
- video encoder: `libx264`
- audio encoder: `aac`
- input audio normalized in the browser to `WAV/PCM`
- filters: `fps`, `scale`, `format`, `afade`, `aresample`, `aformat`

## Important current status

Before we can switch the app to this minimal core in production, the app-side
audio path should be normalized to `WAV/PCM` in the browser.

That is the design direction we agreed on:

1. User chooses almost any common audio file.
2. Browser decodes it.
3. App converts it to `WAV/PCM`.
4. FFmpeg only receives `PNG + WAV`.

This keeps the custom core much smaller than a build that ships "all audio
codecs".

## Files in this folder

- `component-plan.md`
  - human-readable list of what to keep and what to remove
- `minimal-configure.flags.txt`
  - first-pass FFmpeg configure flags for the custom build
- `minimal.Dockerfile`
  - ready-to-copy minimal upstream Dockerfile
- `apply-minimal-dockerfile.ps1`
  - copies `minimal.Dockerfile` into the cloned upstream repo
- `prepare-upstream.ps1`
  - clones the upstream `ffmpeg.wasm` monorepo at a pinned version into
    `tools/ffmpeg-core-custom/upstream/`
- `build-core.ps1`
  - runs the Docker build and stores artifacts in `tools/ffmpeg-core-custom/output/`

## Planned artifact destination

Once the custom build succeeds, the runtime files should be copied into:

`public/vendor/ffmpeg-core-custom/`

Expected files:

- `ffmpeg-core.js`
- `ffmpeg-core.wasm`

These are the assets we will later point `QuantizationRecorder` to instead of
the stock `@ffmpeg/core?url` bundle.

## Step-by-step workflow

### 1. Prepare the upstream source tree

Run from repo root:

```powershell
Set-Location tools\ffmpeg-core-custom
.\prepare-upstream.ps1 -Tag v0.12.10
```

This clones:

- `https://github.com/ffmpegwasm/ffmpeg.wasm`
- tag: `v0.12.10`

into:

- `tools/ffmpeg-core-custom/upstream/ffmpeg.wasm-v0.12.10`

We pin `v0.12.10` because the current app depends on `@ffmpeg/core` `0.12.10`.

### 2. Replace the upstream Dockerfile with the minimal one

Run:

```powershell
.\apply-minimal-dockerfile.ps1
```

This replaces the cloned upstream `Dockerfile` with our reduced version.

You can still inspect the plan in:

- `tools/ffmpeg-core-custom/component-plan.md`
- `tools/ffmpeg-core-custom/minimal-configure.flags.txt`

### 3. Build the custom core

Run:

```powershell
.\build-core.ps1
```

This runs the upstream Docker build and writes build artifacts into:

- `tools/ffmpeg-core-custom/output/`

### 4. Copy the generated artifacts

After a successful build, the generated files should be under:

- `tools/ffmpeg-core-custom/output/dist/umd/`

Copy these files into:

- `public/vendor/ffmpeg-core-custom/`

### 5. Switch the application to the custom core

After the files exist, we will patch `QuantizationRecorder.tsx` to load:

- `/vendor/ffmpeg-core-custom/ffmpeg-core.js`
- `/vendor/ffmpeg-core-custom/ffmpeg-core.wasm`

instead of the stock core assets. The `@ffmpeg/ffmpeg` worker can stay as-is.

## Why we are not switching runtime today

This commit prepares the build structure only.

We are not yet changing runtime imports because:

1. the custom core artifacts do not exist yet
2. we still want the current app to build and run immediately

## References

- ffmpeg.wasm custom core docs:
  [https://ffmpegwasm.netlify.app/docs/contribution/core/](https://ffmpegwasm.netlify.app/docs/contribution/core/)
- ffmpeg.wasm overview:
  [https://ffmpegwasm.netlify.app/docs/overview/](https://ffmpegwasm.netlify.app/docs/overview/)
- Cloudflare Pages limits:
  [https://developers.cloudflare.com/pages/platform/limits/](https://developers.cloudflare.com/pages/platform/limits/)
