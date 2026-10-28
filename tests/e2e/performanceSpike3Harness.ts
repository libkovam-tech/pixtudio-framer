import { pngLatencyDiagnostics as diagnostic } from "./performanceSpike2Harness"
import type { PerformanceSource } from "./performanceReferenceFixture"
import { decodeAndValidateRasterImageFile } from "../../src/editor/fileIntakeSecurity"
import { renderFinalFrame } from "../../src/plugins/batchPixelation/render/finalFrame"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope"
import { runBatchFrames, type BatchFrameTiming } from "../../src/plugins/batchPixelation/runner/runBatchFrames"
import { scanSourceSet } from "../../src/plugins/batchPixelation/sourceSet/scanSourceSet"
import type { SourceDirectoryHandle } from "../../src/plugins/batchPixelation/sourceSet/sourceDirectory"

export type HeadedCase = "cold-canvas" | "cold-runner" | "canvas-transition" | "runner-transition" | "blank"

function state() { return { visibility: document.visibilityState, focused: document.hasFocus() } }

export async function runner(sealed: SealedReference, source: PerformanceSource, proofPixels?: ImageData) {
    const count = proofPixels ? 1 : 10
    const directory: SourceDirectoryHandle = { kind: "directory", name: "SPIKE_3", async *values() {
        for (let index = 1; index <= count; index++) {
            const name = `frame${index}.png`
            yield { kind: "file", name, async getFile() {
                return new File([Uint8Array.from(source.bytes)], name, { type: source.type })
            } }
        }
    } }
    const scan = await scanSourceSet(directory, sealed.referenceInputGeometry)
    const samples: { call: number; milliseconds: number; bytes: number; width: number; height: number }[] = []
    const frames: BatchFrameTiming[] = []
    const native = HTMLCanvasElement.prototype.toBlob
    let exact: Awaited<ReturnType<typeof diagnostic.provePng>> | null = null
    HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) {
        const started = performance.now()
        const width = this.width
        const height = this.height
        native.call(this, blob => {
            if (blob) samples.push({ call: samples.length + 1, milliseconds: performance.now() - started,
                bytes: blob.size, width, height })
            callback(blob)
        }, type, quality)
    }
    const startState = state()
    try {
        const result = await runBatchFrames(sealed, scan.manifest, scan.runtime, {
            async writeFrame(frame) {
                if (proofPixels) exact = await diagnostic.provePng(proofPixels, frame.png)
                else if (frame.png.type !== "image/png" || frame.png.size <= 0) throw new Error("Invalid benchmark PNG")
            },
        }, { onSetup() {}, onFrame(frame) { frames.push(frame) } })
        if (result.succeeded !== count || samples.length !== count || frames.length !== count ||
            result.resources.decodedOpened !== count || result.resources.decodedClosed !== count ||
            result.resources.peakActiveDecoded !== 1) throw new Error("Headed runner invariant failed")
        return { samples, callbackStatistics: diagnostic.statistics(samples.map(sample => sample.milliseconds)),
            frames, frameStatistics: diagnostic.statistics(frames.map(frame => frame.totalMs)),
            resources: result.resources, exact, startState, endState: state() }
    } finally { HTMLCanvasElement.prototype.toBlob = native }
}

export async function measure(caseName: HeadedCase, sealed: SealedReference | null, source: PerformanceSource) {
    const events: { event: string; ms: number; visibility: DocumentVisibilityState; focused: boolean }[] = []
    const started = performance.now()
    const record = (event: Event) => events.push({ event: event.type, ms: performance.now() - started, ...state() })
    document.addEventListener("visibilitychange", record)
    window.addEventListener("focus", record)
    window.addEventListener("blur", record)
    const initialState = state()
    let bitmap = caseName === "blank" ? null : await decodeAndValidateRasterImageFile(
        new File([Uint8Array.from(source.bytes)], source.name, { type: source.type }))
    const canvas = bitmap && sealed ? renderFinalFrame(bitmap, sealed.recipe) : document.createElement("canvas")
    try {
        if (caseName === "blank") {
            canvas.width = 512
            canvas.height = 512
            const context = canvas.getContext("2d")
            if (!context) throw new Error("Blank control context unavailable")
            for (let y = 0; y < 512; y += 16) for (let x = 0; x < 512; x += 16) {
                context.fillStyle = `rgb(${x % 256}, ${y % 256}, ${(x + y * 3) % 256})`
                context.fillRect(x, y, 16, 16)
            }
        }
        if (caseName === "cold-canvas" || caseName === "canvas-transition" || caseName === "blank") {
            const cold = await diagnostic.repeat(canvas, "cold", 10)
            const expected = diagnostic.pixels(canvas)
            const probe = cold.series.statistics.median > 500 ? await diagnostic.mainThreadProbe(canvas, false) : null
            let transition = null
            if (caseName === "canvas-transition") {
                const before = performance.now()
                await diagnostic.animationFrame()
                const waitMs = performance.now() - before
                const first = await diagnostic.encode(canvas, 1)
                const plain = await diagnostic.repeat(canvas, "plain-after-single-raf", 10)
                transition = { waitMs, explicitRafCount: 1, first: first.sample, plain: plain.series,
                    exact: await diagnostic.provePng(expected, plain.lastBlob) }
            }
            return { caseName, cold: cold.series, probe, transition,
                exact: await diagnostic.provePng(expected, cold.lastBlob),
                initialState, finalState: state(), events }
        }
        if (!sealed) throw new Error("Headed runner requires sealed recipe")
        const expected = diagnostic.pixels(canvas)
        diagnostic.release(canvas)
        bitmap?.close()
        bitmap = null
        const cold = await runner(sealed, source)
        let transition = null
        if (caseName === "runner-transition") {
            const before = performance.now()
            await diagnostic.animationFrame()
            const waitMs = performance.now() - before
            const after = await runner(sealed, source)
            transition = { waitMs, explicitRafCount: 1, after }
        }
        // Exactness is a separate run; measured sinks retain no output and do not decode it.
        const proof = await runner(sealed, source, expected)
        return { caseName, coldRunner: cold, runnerTransition: transition, exact: proof.exact,
            initialState, finalState: state(), events }
    } finally {
        diagnostic.release(canvas)
        bitmap?.close()
        document.removeEventListener("visibilitychange", record)
        window.removeEventListener("focus", record)
        window.removeEventListener("blur", record)
    }
}
