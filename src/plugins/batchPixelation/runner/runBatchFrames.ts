import { decodeAndValidateRasterImageFile, FileIntakeError } from "../../../editor/fileIntakeSecurity.ts"
import { validateFinalFrameRecipe, renderFinalFrame } from "../render/finalFrame.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"
import { assertStaticBatchRasterFile, BatchRasterPreflightError } from "../staticRasterPolicy.ts"
import type { SourceSetManifest, SourceSetRuntime, SourceGeometry } from "../sourceSet/scanSourceSet.ts"
import type { ReplayTimingStage } from "../render/replayTiming.ts"

export type BatchTimingStage = "getFile" | "preflight" | "decode" | "geometry" | "renderFinalFrame" |
    "pngEncode" | "sinkWriteFrame" | "cleanup" | ReplayTimingStage

export type BatchFrameTiming = Readonly<{
    orderIndex: number
    stages: Readonly<Partial<Record<BatchTimingStage, number>>>
    totalMs: number
}>

export type BatchTimingObserver = Readonly<{
    onSetup(milliseconds: number): void
    onFrame(timing: BatchFrameTiming): void
}>

export type BatchFrameOutput = Readonly<{
    orderIndex: number
    sourceFilename: string
    outputName: string
    width: number
    height: number
    png: Blob
}>

export interface BatchFrameOutputSink {
    writeFrame(frame: BatchFrameOutput): Promise<void>
}

export class BatchOutputSinkFatalError extends Error {
    readonly code: "quota" | "unavailable"
    constructor(message: string, code: "quota" | "unavailable" = "unavailable") {
        super(message)
        this.name = "BatchOutputSinkFatalError"
        this.code = code
    }
}

export type BatchRuntimeFailureReason =
    | "source-handle-missing"
    | "source-read-failed"
    | "source-changed"
    | "unsupported-format"
    | "animated-gif"
    | "animated-png"
    | "invalid-or-corrupt"
    | "encoded-file-too-large"
    | "decoded-image-too-large"
    | "geometry-mismatch"
    | "render-failed"
    | "png-encode-failed"
    | "sink-write-failed"

export type BatchFrameOutcome = Readonly<{
    orderIndex: number
    sourceFilename: string
    outputName: string
    status: "succeeded" | "failed"
    reason: BatchRuntimeFailureReason | null
    pngBytes: number | null
    outputGeometry: SourceGeometry | null
}>

export type BatchRunResult = Readonly<{
    status: "completed" | "cancelled" | "failed"
    attempted: number
    succeeded: number
    runtimeFailed: number
    outcomes: readonly BatchFrameOutcome[]
    resources: Readonly<{
        decodedOpened: number
        decodedClosed: number
        peakActiveDecoded: number
        sinkWriteAttempts: number
        sinkWriteSucceeded: number
    }>
}>

export type BatchRunControl = Readonly<{
    signal: AbortSignal
    onFrameStarted?(entry: Readonly<{ orderIndex: number; filename: string }>): void
    onFrameSettled?(outcome: BatchFrameOutcome): void
}>

// Fatal runs retain only safely settled outcomes, never an invented frame failure.
export class BatchRunFatalError extends Error {
    readonly partial: BatchRunResult

    constructor(cause: unknown, partial: BatchRunResult) {
        super(cause instanceof Error ? cause.message : "Batch infrastructure failure", { cause })
        this.name = "BatchRunFatalError"
        this.partial = partial
    }
}

type PlannedFrame = SourceSetManifest["processable"][number]

function sameGeometry(a: SourceGeometry, b: SourceGeometry): boolean {
    return a.width === b.width && a.height === b.height
}

function validateRunPlan(sealed: SealedReference, manifest: SourceSetManifest,
    runtime: SourceSetRuntime, sink: BatchFrameOutputSink): Map<number, SourceSetRuntime["orderedFileHandles"][number]> {
    validateFinalFrameRecipe(sealed.recipe)
    if (manifest.version !== 1 || manifest.overallStatus !== "ready" || !manifest.sourceGeometry ||
        !sameGeometry(manifest.sourceGeometry, manifest.referenceInputGeometry) ||
        !sameGeometry(manifest.referenceInputGeometry, sealed.referenceInputGeometry) ||
        manifest.counts.candidates !== manifest.orderedCandidates.length ||
        manifest.counts.processable !== manifest.processable.length ||
        typeof sink.writeFrame !== "function") {
        throw new Error("Invalid or incompatible Batch run plan")
    }
    const handles = new Map<number, SourceSetRuntime["orderedFileHandles"][number]>()
    for (const row of runtime.orderedFileHandles) {
        if (handles.has(row.orderIndex)) throw new Error("Ambiguous Source Set runtime association")
        handles.set(row.orderIndex, row)
    }
    let previousIndex = -1
    const outputs = new Set<string>()
    for (const entry of manifest.processable) {
        const candidate = manifest.orderedCandidates[entry.orderIndex]
        if (entry.orderIndex <= previousIndex || candidate?.orderIndex !== entry.orderIndex ||
            candidate.status !== "eligible" || candidate.filename !== entry.filename ||
            candidate.plannedOutputName !== entry.outputName || outputs.has(entry.outputName)) {
            throw new Error("Inconsistent Source Set processing plan")
        }
        const runtimeRow = handles.get(entry.orderIndex)
        if (runtimeRow && runtimeRow.filename !== entry.filename) {
            throw new Error("Ambiguous Source Set runtime association")
        }
        outputs.add(entry.outputName)
        previousIndex = entry.orderIndex
    }
    return handles
}

function inputFailure(error: unknown, stage: "preflight" | "decode"): BatchRuntimeFailureReason | null {
    if (error instanceof BatchRasterPreflightError) {
        if (error.code === "animated-gif" || error.code === "animated-png") return error.code
        return error.code === "unsupported" ? "unsupported-format" : "invalid-or-corrupt"
    }
    if (error instanceof FileIntakeError) {
        if (error.code === "unsupported-file") return "unsupported-format"
        if (error.code === "image-too-large") return stage === "preflight"
            ? "encoded-file-too-large" : "decoded-image-too-large"
        if (error.code === "image-decode-failed") return "invalid-or-corrupt"
    }
    return null
}

function failureOutcome(entry: PlannedFrame, reason: BatchRuntimeFailureReason): BatchFrameOutcome {
    return { orderIndex: entry.orderIndex, sourceFilename: entry.filename, outputName: entry.outputName,
        status: "failed", reason, pngBytes: null, outputGeometry: null }
}

function encodePng(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        try {
            canvas.toBlob(blob => blob?.type === "image/png" ? resolve(blob) :
                reject(new Error("PNG encoder did not return a PNG")), "image/png")
        } catch (error) {
            reject(error)
        }
    })
}

export async function runBatchFrames(sealed: SealedReference, manifest: SourceSetManifest,
    runtime: SourceSetRuntime, sink: BatchFrameOutputSink,
    timing?: BatchTimingObserver, control?: BatchRunControl): Promise<BatchRunResult> {
    const setupStarted = timing ? performance.now() : 0
    const handles = validateRunPlan(sealed, manifest, runtime, sink)
    const plan = manifest.processable.map(entry => ({ ...entry }))
    timing?.onSetup(performance.now() - setupStarted)
    const outcomes: BatchFrameOutcome[] = []
    let attempted = 0
    let decodedOpened = 0
    let decodedClosed = 0
    let activeDecoded = 0
    let peakActiveDecoded = 0
    let sinkWriteAttempts = 0
    let sinkWriteSucceeded = 0

    const result = (status: BatchRunResult["status"]): BatchRunResult => Object.freeze({
        status, attempted,
        succeeded: outcomes.filter(outcome => outcome.status === "succeeded").length,
        runtimeFailed: outcomes.filter(outcome => outcome.status === "failed").length,
        outcomes: Object.freeze([...outcomes]), resources: Object.freeze({ decodedOpened, decodedClosed,
            peakActiveDecoded, sinkWriteAttempts, sinkWriteSucceeded }),
    })
    const settle = (outcome: BatchFrameOutcome) => {
        if (outcome.outputGeometry) Object.freeze(outcome.outputGeometry)
        outcomes.push(Object.freeze(outcome))
        control?.onFrameSettled?.(outcome)
    }

    try {
        for (const entry of plan) {
            if (control?.signal.aborted) return result("cancelled")
            attempted++
            control?.onFrameStarted?.(Object.freeze({ orderIndex: entry.orderIndex, filename: entry.filename }))
            const frameStarted = timing ? performance.now() : 0
            const stages: Partial<Record<BatchTimingStage, number>> = {}
            const record = (stage: BatchTimingStage, started: number) => {
                if (timing) stages[stage] = performance.now() - started
            }
            const finish = () => timing?.onFrame({ orderIndex: entry.orderIndex,
                stages, totalMs: performance.now() - frameStarted })
            const row = handles.get(entry.orderIndex)
            if (!row) {
                finish()
                settle(failureOutcome(entry, "source-handle-missing"))
                continue
            }
            if (row.handle.name !== entry.filename) {
                finish()
                settle(failureOutcome(entry, "source-changed"))
                continue
            }

            let bitmap: ImageBitmap | null = null
            let canvas: HTMLCanvasElement | null = null
            let png: Blob | null = null
            let outcome: BatchFrameOutcome | null = null
            let stage: "read" | "preflight" | "decode" | "render" | "encode" | "sink" = "read"
            try {
                let started = timing ? performance.now() : 0
                const file = await row.handle.getFile()
                record("getFile", started)
                if (file.name !== entry.filename) {
                    outcome = failureOutcome(entry, "source-changed")
                    continue
                }
                stage = "preflight"
                started = timing ? performance.now() : 0
                await assertStaticBatchRasterFile(file)
                record("preflight", started)
                stage = "decode"
                started = timing ? performance.now() : 0
                bitmap = await decodeAndValidateRasterImageFile(file)
                record("decode", started)
                decodedOpened++
                activeDecoded++
                peakActiveDecoded = Math.max(peakActiveDecoded, activeDecoded)
                started = timing ? performance.now() : 0
                if (!sameGeometry(bitmap, manifest.sourceGeometry!)) {
                    outcome = failureOutcome(entry, "geometry-mismatch")
                    continue
                }
                record("geometry", started)
                stage = "render"
                started = timing ? performance.now() : 0
                canvas = renderFinalFrame(bitmap, sealed.recipe, timing
                    ? (renderStage, milliseconds) => { stages[renderStage] = milliseconds } : undefined)
                record("renderFinalFrame", started)
                stage = "encode"
                started = timing ? performance.now() : 0
                png = await encodePng(canvas)
                record("pngEncode", started)
                stage = "sink"
                sinkWriteAttempts++
                started = timing ? performance.now() : 0
                await sink.writeFrame({ orderIndex: entry.orderIndex, sourceFilename: entry.filename,
                    outputName: entry.outputName, width: canvas.width, height: canvas.height, png })
                record("sinkWriteFrame", started)
                sinkWriteSucceeded++
                outcome = { orderIndex: entry.orderIndex, sourceFilename: entry.filename,
                    outputName: entry.outputName, status: "succeeded", reason: null,
                    pngBytes: png.size, outputGeometry: { width: canvas.width, height: canvas.height } }
            } catch (error) {
                if (error instanceof BatchOutputSinkFatalError) throw error
                const inputReason = stage === "preflight" || stage === "decode"
                    ? inputFailure(error, stage) : null
                if ((stage === "preflight" || stage === "decode") && !inputReason &&
                    !(error instanceof Error && ["NotFoundError", "NotReadableError", "NotAllowedError"].includes(error.name))) {
                    throw error
                }
                const reason: BatchRuntimeFailureReason = stage === "read" ? "source-read-failed" :
                    stage === "preflight" || stage === "decode" ? inputReason ?? "source-read-failed" :
                        stage === "render" ? "render-failed" :
                            stage === "encode" ? "png-encode-failed" : "sink-write-failed"
                outcome = failureOutcome(entry, reason)
            } finally {
                const cleanupStarted = timing ? performance.now() : 0
                if (canvas) {
                    canvas.width = 0
                    canvas.height = 0
                }
                png = null
                if (bitmap) {
                    bitmap.close()
                    decodedClosed++
                    activeDecoded--
                }
                record("cleanup", cleanupStarted)
                finish()
                if (outcome) settle(outcome)
            }
        }
    } catch (error) {
        throw new BatchRunFatalError(error, result("failed"))
    }
    return result("completed")
}
