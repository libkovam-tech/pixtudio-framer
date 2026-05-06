import { describe, expect, it, vi } from "vitest"

import { runQuantizationExportPipeline } from "./QuantizationRecorder.export.ts"
import { buildRecorderSteps } from "./QuantizationRecorder.steps.ts"

describe("Quantization Recorder paths", () => {
    it("expands both ways as from -> to -> from without duplicating the peak", () => {
        const steps = buildRecorderSteps({
            includeGridRange: true,
            includePaletteRange: false,
            gridFrom: 16,
            gridTo: 19,
            gridSingle: 16,
            paletteFrom: 10,
            paletteTo: 10,
            paletteSingle: 10,
            direction: "both-ways",
        })

        expect(steps.map((step) => step.gridSize)).toEqual([
            16, 17, 18, 19, 18, 17, 16,
        ])
        expect(steps.map((step) => step.paletteSize)).toEqual([
            10, 10, 10, 10, 10, 10, 10,
        ])
    })
})

describe("Quantization Recorder export pipeline", () => {
    it("encodes MP4 directly from the PNG sequence when conversion is enabled", async () => {
        const writeFile = vi.fn(async () => true)
        const exec = vi.fn().mockResolvedValueOnce(0)
        const readFile = vi
            .fn()
            .mockResolvedValue(new Uint8Array([1, 2, 3, 4]))
        const deleteFile = vi.fn(async () => true)

        const result = await runQuantizationExportPipeline({
            ffmpeg: {
                writeFile,
                exec,
                readFile,
                deleteFile,
            },
            pngFrames: [
                {
                    name: "frame-00000.png",
                    bytes: new Uint8Array([11, 22]),
                },
                {
                    name: "frame-00001.png",
                    bytes: new Uint8Array([33, 44]),
                },
            ],
            frameDurationSec: 1.5,
            fps: 30,
            videoDurationSec: 3,
            audioFadeSec: 0.5,
        })

        expect(Array.from(result.bytes)).toEqual([1, 2, 3, 4])
        expect(result.format).toBe("mp4")
        expect(result.filename).toBe("pixtudio-quantization.mp4")
        expect(result.mimeType).toBe("video/mp4")
        expect(writeFile).toHaveBeenCalledWith(
            "frame-00000.png",
            expect.any(Uint8Array)
        )
        expect(writeFile).toHaveBeenCalledWith(
            "frame-00001.png",
            expect.any(Uint8Array)
        )
        expect(writeFile).toHaveBeenCalledWith(
            "quantization-frames.txt",
            expect.any(Uint8Array)
        )
        expect(exec).toHaveBeenNthCalledWith(1, [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            "quantization-frames.txt",
            "-vf",
            "fps=30,scale=iw*4:ih*4:flags=neighbor,format=yuv420p",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-tune",
            "animation",
            "-crf",
            "6",
            "quantization-preview.mp4",
        ])
        expect(readFile).toHaveBeenCalledWith("quantization-preview.mp4")
        expect(deleteFile).toHaveBeenCalledWith("frame-00000.png")
        expect(deleteFile).toHaveBeenCalledWith("frame-00001.png")
        expect(deleteFile).toHaveBeenCalledWith("quantization-frames.txt")
        expect(deleteFile).toHaveBeenCalledWith("quantization-preview.mp4")
    })

    it("can stop after WEBM stage when MP4 conversion is disabled", async () => {
        const writeFile = vi.fn(async () => true)
        const exec = vi.fn().mockResolvedValueOnce(0)
        const readFile = vi
            .fn()
            .mockResolvedValue(new Uint8Array([9, 9, 9, 9]))
        const deleteFile = vi.fn(async () => true)

        const result = await runQuantizationExportPipeline({
            ffmpeg: {
                writeFile,
                exec,
                readFile,
                deleteFile,
            },
            pngFrames: [
                {
                    name: "frame-00000.png",
                    bytes: new Uint8Array([11, 22]),
                },
            ],
            frameDurationSec: 1,
            fps: 30,
            videoDurationSec: 1,
            enableMp4Conversion: false,
        })

        expect(exec).toHaveBeenCalledTimes(1)
        expect(result.format).toBe("webm")
        expect(result.filename).toBe("pixtudio-quantization.webm")
        expect(result.mimeType).toBe("video/webm")
        expect(Array.from(result.bytes)).toEqual([9, 9, 9, 9])
        expect(deleteFile).toHaveBeenCalledWith("quantization-preview.webm")
    })

    it("adds audio with fade in and fade out when a track is provided", async () => {
        const writeFile = vi.fn(async () => true)
        const exec = vi
            .fn()
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
        const readFile = vi
            .fn()
            .mockResolvedValue(new Uint8Array([4, 3, 2, 1]))
        const deleteFile = vi.fn(async () => true)

        await runQuantizationExportPipeline({
            ffmpeg: {
                writeFile,
                exec,
                readFile,
                deleteFile,
            },
            pngFrames: [
                {
                    name: "frame-00000.png",
                    bytes: new Uint8Array([11, 22]),
                },
            ],
            audioTrack: {
                name: "audio-track.mp3",
                bytes: new Uint8Array([9, 8, 7]),
            },
            frameDurationSec: 1,
            fps: 30,
            videoDurationSec: 5,
            audioFadeSec: 0.5,
        })

        expect(writeFile).toHaveBeenCalledWith(
            "audio-track.mp3",
            expect.any(Uint8Array)
        )
        expect(exec).toHaveBeenNthCalledWith(1, [
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            "quantization-frames.txt",
            "-i",
            "audio-track.mp3",
            "-vf",
            "fps=30,scale=iw*4:ih*4:flags=neighbor,format=yuv420p",
            "-af",
            "afade=t=in:st=0:d=0.500,afade=t=out:st=4.500:d=0.500",
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
            "5.000",
            "quantization-preview.mp4",
        ])
        expect(deleteFile).toHaveBeenCalledWith("audio-track.mp3")
    })

})
