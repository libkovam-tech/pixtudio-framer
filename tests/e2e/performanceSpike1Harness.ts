import { decodeAndValidateRasterImageFile } from "../../src/editor/fileIntakeSecurity.ts"
import { renderFinalFrame } from "../../src/plugins/batchPixelation/render/finalFrame.ts"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope.ts"
import { runBatchFrames, type BatchFrameOutput, type BatchFrameTiming,
} from "../../src/plugins/batchPixelation/runner/runBatchFrames.ts"
import { scanSourceSet } from "../../src/plugins/batchPixelation/sourceSet/scanSourceSet.ts"
import type { SourceDirectoryHandle } from "../../src/plugins/batchPixelation/sourceSet/sourceDirectory.ts"

export type BenchSource = Readonly<{ name: string; type: string; bytes: number[] }>
export type BenchMode = "evidence" | "minimal"
type EvidenceTiming = { arrayBuffer: number; hash: number; pngDecode: number; rgbaInspect: number; release: number }

function directoryFor(sources: readonly BenchSource[]): SourceDirectoryHandle {
    return { kind: "directory", name: "PERFORMANCE_SPIKE_1", async *values() {
        for (const source of sources) {
            yield { kind: "file", name: source.name, async getFile() {
                return new File([Uint8Array.from(source.bytes)], source.name, { type: source.type })
            } }
        }
    } }
}

async function inspectEvidence(frame: BatchFrameOutput): Promise<EvidenceTiming> {
    let started = performance.now()
    const bytes = await frame.png.arrayBuffer()
    const arrayBuffer = performance.now() - started
    started = performance.now()
    await crypto.subtle.digest("SHA-256", bytes)
    const hash = performance.now() - started
    started = performance.now()
    const bitmap = await createImageBitmap(frame.png)
    const pngDecode = performance.now() - started
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    let rgbaInspect = 0
    let release = 0
    try {
        started = performance.now()
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Evidence sink canvas unavailable")
        context.drawImage(bitmap, 0, 0)
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
        if (rgba.length !== frame.width * frame.height * 4) throw new Error("Evidence RGBA size mismatch")
        rgbaInspect = performance.now() - started
    } finally {
        started = performance.now()
        canvas.width = 0
        canvas.height = 0
        bitmap.close()
        release = performance.now() - started
    }
    return { arrayBuffer, hash, pngDecode, rgbaInspect, release }
}

function sinkFor(mode: BenchMode, evidence: Map<number, EvidenceTiming>) {
    let accepted = 0
    return { sink: { async writeFrame(frame: BatchFrameOutput) {
        if (frame.png.type !== "image/png" || frame.png.size <= 0) {
            throw new Error("Invalid benchmark output")
        }
        if (mode === "evidence") evidence.set(frame.orderIndex, await inspectEvidence(frame))
        accepted++
    } }, accepted: () => accepted }
}

async function runMode(sealed: SealedReference,
    scan: Awaited<ReturnType<typeof scanSourceSet>>, mode: BenchMode, measured: boolean) {
    const evidence = new Map<number, EvidenceTiming>()
    const output = sinkFor(mode, evidence)
    const samples: BatchFrameTiming[] = []
    let setupMs = 0
    const started = performance.now()
    const result = await runBatchFrames(sealed, scan.manifest, scan.runtime, output.sink,
        measured ? { onSetup(milliseconds) { setupMs = milliseconds },
            onFrame(sample) { samples.push(sample) } } : undefined)
    const wallMs = performance.now() - started
    if (result.succeeded !== scan.manifest.processable.length || output.accepted() !== result.succeeded) {
        throw new Error(`Benchmark run failed in ${mode}: ${JSON.stringify(result.outcomes)}`)
    }
    if (result.resources.decodedOpened !== result.resources.decodedClosed ||
        result.resources.peakActiveDecoded !== 1) throw new Error("Benchmark resource invariant failed")
    return { mode, wallMs, setupMs, samples,
        evidence: [...evidence].map(([orderIndex, stages]) => ({ orderIndex, stages })),
        result: { attempted: result.attempted, succeeded: result.succeeded, resources: result.resources } }
}

export async function proveProfiledExact(sealed: SealedReference, source: BenchSource) {
    const scan = await scanSourceSet(directoryFor([source]), sealed.referenceInputGeometry)
    let png: Blob | null = null
    let observedFrames = 0
    await runBatchFrames(sealed, scan.manifest, scan.runtime,
        { async writeFrame(frame) { png = frame.png } },
        { onSetup() {}, onFrame() { observedFrames++ } })
    if (!png) throw new Error("Exactness sample produced no PNG")
    const file = new File([Uint8Array.from(source.bytes)], source.name, { type: source.type })
    const bitmap = await decodeAndValidateRasterImageFile(file)
    const encoded = await createImageBitmap(png)
    let direct: HTMLCanvasElement | null = null
    const canvas = document.createElement("canvas")
    try {
        direct = renderFinalFrame(bitmap, sealed.recipe)
        canvas.width = encoded.width
        canvas.height = encoded.height
        const context = canvas.getContext("2d")
        const directContext = direct.getContext("2d")
        if (!context || !directContext) throw new Error("Exactness sample canvas unavailable")
        context.drawImage(encoded, 0, 0)
        const actual = context.getImageData(0, 0, canvas.width, canvas.height).data
        const expected = directContext.getImageData(0, 0, direct.width, direct.height).data
        let differentBytes = actual.length === expected.length ? 0 : Math.max(actual.length, expected.length)
        if (actual.length === expected.length) {
            for (let index = 0; index < actual.length; index++) if (actual[index] !== expected[index]) differentBytes++
        }
        return { directWidth: direct.width, directHeight: direct.height,
            pngWidth: canvas.width, pngHeight: canvas.height,
            directRgbaLength: expected.length, pngRgbaLength: actual.length, differentBytes,
            observedFrames }
    } finally {
        if (direct) { direct.width = 0; direct.height = 0 }
        canvas.width = 0
        canvas.height = 0
        bitmap.close()
        encoded.close()
    }
}

export async function benchmarkRecipe(sealed: SealedReference, sources: BenchSource[]) {
    const experimentStarted = performance.now()
    if (sources.length !== 50) throw new Error("Benchmark requires exactly 50 measured frames")
    const setupStarted = performance.now()
    const measuredScanStarted = performance.now()
    const measuredScan = await scanSourceSet(directoryFor(sources), sealed.referenceInputGeometry)
    const measuredScanMs = performance.now() - measuredScanStarted
    const warmupScanStarted = performance.now()
    const warmupScan = await scanSourceSet(directoryFor(sources.slice(0, 5)), sealed.referenceInputGeometry)
    const warmupScanMs = performance.now() - warmupScanStarted
    if (measuredScan.manifest.overallStatus !== "ready" || measuredScan.manifest.processable.length !== 50 ||
        warmupScan.manifest.processable.length !== 5) throw new Error("Benchmark scan is not ready")
    const setupMs = performance.now() - setupStarted
    const modes: BenchMode[] = sealed.recipe.palette.source === "auto"
        ? ["minimal", "evidence"] : ["evidence", "minimal"]
    const runs = []
    for (const mode of modes) {
        const warmup = await runMode(sealed, warmupScan, mode, false)
        const measured = await runMode(sealed, measuredScan, mode, true)
        runs.push({ ...measured, warmupMs: warmup.wallMs })
    }
    const exact = await proveProfiledExact(sealed, sources[0])
    return { setupMs, measuredScanMs, warmupScanMs, runs, exact,
        experimentWallMs: performance.now() - experimentStarted,
        sourceCount: sources.length, sourceGeometry: measuredScan.manifest.sourceGeometry }
}

export async function diagnoseRenderedPng(sealed: SealedReference, source: BenchSource) {
    const file = new File([Uint8Array.from(source.bytes)], source.name, { type: source.type })
    const bitmap = await decodeAndValidateRasterImageFile(file)
    let canvas: HTMLCanvasElement | null = null
    try {
        const renderStarted = performance.now()
        canvas = renderFinalFrame(bitmap, sealed.recipe)
        const renderMs = performance.now() - renderStarted
        const samples = []
        for (const waitMs of [0, 0, 0, 10]) {
            if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs))
            const started = performance.now()
            const blob = await new Promise<Blob>((resolve, reject) => canvas!.toBlob(value =>
                value ? resolve(value) : reject(new Error("Rendered PNG diagnostic failed")), "image/png"))
            samples.push({ waitMs, callbackMs: performance.now() - started, pngBytes: blob.size })
        }
        return { renderMs, width: canvas.width, height: canvas.height, samples }
    } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0 }
        bitmap.close()
    }
}

export async function diagnoseFirstRunnerFrame(sealed: SealedReference, source: BenchSource) {
    const scanStarted = performance.now()
    const scan = await scanSourceSet(directoryFor([source]), sealed.referenceInputGeometry)
    const scanMs = performance.now() - scanStarted
    const evidence = new Map<number, EvidenceTiming>()
    const output = sinkFor("minimal", evidence)
    let setupMs = 0
    let firstFrame: BatchFrameTiming | null = null
    const result = await runBatchFrames(sealed, scan.manifest, scan.runtime, output.sink, {
        onSetup(milliseconds) { setupMs = milliseconds },
        onFrame(sample) { firstFrame = sample },
    })
    if (result.succeeded !== 1 || !firstFrame || output.accepted() !== 1) {
        throw new Error("First runner frame did not complete")
    }
    return { scanMs, setupMs, firstFrame, resources: result.resources }
}
