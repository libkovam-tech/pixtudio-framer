import type { FFmpeg } from "@ffmpeg/ffmpeg"

type RecorderFfmpegLike = Pick<
    FFmpeg,
    "writeFile" | "exec" | "readFile" | "deleteFile"
>

export type RecorderExportPngFrame = {
    name: string
    bytes: Uint8Array
}

export type RecorderExportAudioTrack = {
    name: string
    bytes: Uint8Array
}

export type RecorderExportDebugLog = (
    message: string,
    payload?: Record<string, unknown>
) => void

export type RecorderExportResult = {
    bytes: Uint8Array
    mimeType: string
    filename: string
    format: "webm" | "mp4"
}

const MP4_UPSCALE_FACTOR = 4

function buildConcatManifest(
    frames: Array<{ name: string }>,
    frameDurationSec: number
) {
    if (frames.length <= 0) return ""
    const safeDuration = Math.max(0.001, frameDurationSec)
    const lines: string[] = []
    for (const frame of frames) {
        lines.push(`file '${frame.name}'`)
        lines.push(`duration ${safeDuration.toFixed(6)}`)
    }
    lines.push(`file '${frames[frames.length - 1].name}'`)
    return lines.join("\n")
}

export async function runQuantizationExportPipeline(params: {
    ffmpeg: RecorderFfmpegLike
    pngFrames: RecorderExportPngFrame[]
    audioTrack?: RecorderExportAudioTrack | null
    frameDurationSec: number
    fps: number
    videoDurationSec: number
    audioFadeSec?: number
    enableMp4Conversion?: boolean
    onStageChange?: (stage: string) => void
    onDebugLog?: RecorderExportDebugLog
    cleanupNames?: string[]
}): Promise<RecorderExportResult> {
    const {
        ffmpeg,
        pngFrames,
        audioTrack,
        frameDurationSec,
        fps,
        videoDurationSec,
        audioFadeSec,
        enableMp4Conversion = true,
        onStageChange,
        onDebugLog,
        cleanupNames = [],
    } = params

    if (pngFrames.length <= 0) {
        throw new Error("There are no generated frames to export.")
    }

    const manifestName = "quantization-frames.txt"
    const mp4Name = "quantization-preview.mp4"
    const webmName = "quantization-preview.webm"
    const textEncoder = new TextEncoder()
    const mp4ScaleFilter = `fps=${fps},scale=iw*${MP4_UPSCALE_FACTOR}:ih*${MP4_UPSCALE_FACTOR}:flags=neighbor,format=yuv420p`

    onDebugLog?.("Export pipeline started", {
        frames: pngFrames.length,
        frameDurationSec,
        fps,
        hasAudioTrack: Boolean(audioTrack),
        videoDurationSec,
        audioFadeSec: audioTrack ? audioFadeSec ?? null : null,
        enableMp4Conversion,
    })

    for (const frame of pngFrames) {
        onDebugLog?.("Writing PNG frame into ffmpeg FS", {
            name: frame.name,
            bytes: frame.bytes.byteLength,
        })
        await ffmpeg.writeFile(frame.name, frame.bytes.slice())
    }

    if (audioTrack) {
        onDebugLog?.("Writing audio track into ffmpeg FS", {
            name: audioTrack.name,
            bytes: audioTrack.bytes.byteLength,
        })
        await ffmpeg.writeFile(audioTrack.name, audioTrack.bytes.slice())
    }

    onDebugLog?.("Writing concat manifest", {
        manifestName,
        frameCount: pngFrames.length,
    })
    await ffmpeg.writeFile(
        manifestName,
        textEncoder.encode(buildConcatManifest(pngFrames, frameDurationSec))
    )

    if (!enableMp4Conversion) {
        onStageChange?.("Building WEBM...")
        onDebugLog?.("Launching WEBM command", {
            args: [
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                manifestName,
                "-vf",
                `fps=${fps}`,
                "-an",
                "-c:v",
                "libvpx-vp9",
                "-pix_fmt",
                "yuv444p",
                "-quality",
                "best",
                "-lossless",
                "1",
                "-deadline",
                "best",
                "-cpu-used",
                "0",
                "-row-mt",
                "0",
                "-tile-columns",
                "0",
                "-frame-parallel",
                "0",
                "-auto-alt-ref",
                "0",
                webmName,
            ],
        })
        const webmExit = await ffmpeg.exec([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            manifestName,
            "-vf",
            `fps=${fps}`,
            "-an",
            "-c:v",
            "libvpx-vp9",
            "-pix_fmt",
            "yuv444p",
            "-quality",
            "best",
            "-lossless",
            "1",
            "-deadline",
            "best",
            "-cpu-used",
            "0",
            "-row-mt",
            "0",
            "-tile-columns",
            "0",
            "-frame-parallel",
            "0",
            "-auto-alt-ref",
            "0",
            webmName,
        ])
        onDebugLog?.("WEBM command completed", { exitCode: webmExit })

        if (webmExit !== 0) {
            throw new Error("WEBM assembly failed inside ffmpeg.")
        }

        if (audioTrack) {
            onDebugLog?.(
                "Audio track ignored because MP4 conversion is disabled"
            )
        }

        onStageChange?.("Exporting WEBM...")
        const webmData = (await ffmpeg.readFile(webmName)) as Uint8Array
        onDebugLog?.("WEBM file read from ffmpeg FS", {
            bytes: webmData.byteLength,
        })

        const cleanupList = [
            ...pngFrames.map((frame) => frame.name),
            manifestName,
            webmName,
            ...(audioTrack ? [audioTrack.name] : []),
            ...cleanupNames,
        ]

        await Promise.all(
            cleanupList.map(async (name) => {
                try {
                    await ffmpeg.deleteFile(name)
                    onDebugLog?.("Deleted temporary file", { name })
                } catch {
                    // ignore cleanup errors
                }
            })
        )

        return {
            bytes: new Uint8Array(webmData),
            mimeType: "video/webm",
            filename: "pixtudio-quantization.webm",
            format: "webm",
        }
    }

    const mp4Args = audioTrack
        ? [
              "-f",
              "concat",
              "-safe",
              "0",
              "-i",
              manifestName,
              "-i",
              audioTrack.name,
              "-vf",
              mp4ScaleFilter,
              "-af",
              `afade=t=in:st=0:d=${(audioFadeSec ?? 0.5).toFixed(3)},afade=t=out:st=${Math.max(
                  0,
                  videoDurationSec - (audioFadeSec ?? 0.5)
              ).toFixed(3)}:d=${(audioFadeSec ?? 0.5).toFixed(3)}`,
              "-map",
              "0:v:0",
              "-map",
              "1:a:0",
              "-c:v",
              "libx264",
              "-preset",
              "medium",
              "-tune",
              "animation",
              "-crf",
              "6",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-t",
              videoDurationSec.toFixed(3),
              mp4Name,
          ]
        : [
              "-f",
              "concat",
              "-safe",
              "0",
              "-i",
              manifestName,
              "-vf",
              mp4ScaleFilter,
              "-an",
              "-c:v",
              "libx264",
              "-preset",
              "medium",
              "-tune",
              "animation",
              "-crf",
              "6",
              mp4Name,
          ]

    onStageChange?.(audioTrack ? "Encoding MP4 with audio..." : "Encoding MP4...")
    onDebugLog?.("Launching MP4 command", {
        args: mp4Args,
    })
    const mp4Exit = await ffmpeg.exec(mp4Args)
    onDebugLog?.("MP4 command completed", { exitCode: mp4Exit })

    if (mp4Exit !== 0) {
        throw new Error("MP4 conversion failed inside ffmpeg.")
    }

    const mp4Data = (await ffmpeg.readFile(mp4Name)) as Uint8Array
    onDebugLog?.("MP4 file read from ffmpeg FS", {
        bytes: mp4Data.byteLength,
    })

    const cleanupList = [
        ...pngFrames.map((frame) => frame.name),
        manifestName,
        webmName,
        mp4Name,
        ...(audioTrack ? [audioTrack.name] : []),
        ...cleanupNames,
    ]

    await Promise.all(
        cleanupList.map(async (name) => {
            try {
                await ffmpeg.deleteFile(name)
                onDebugLog?.("Deleted temporary file", { name })
            } catch {
                // ignore cleanup errors
            }
        })
    )

    return {
        bytes: new Uint8Array(mp4Data),
        mimeType: "video/mp4",
        filename: "pixtudio-quantization.mp4",
        format: "mp4",
    }
}
