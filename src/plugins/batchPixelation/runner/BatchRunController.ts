import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"
import { validateFinalFrameRecipe } from "../render/finalFrame.ts"
import type { SourceSetScan } from "../sourceSet/scanSourceSet.ts"
import { BatchOutputSinkFatalError, BatchRunFatalError, runBatchFrames, type BatchFrameOutcome,
    type BatchFrameOutputSink, type BatchRunResult } from "./runBatchFrames.ts"

export type BatchRunStatus = "idle" | "running" | "cancelling" | "completed" | "cancelled" | "failed"
export type BatchProgress = Readonly<{
    status: BatchRunStatus
    totalPlanned: number
    settled: number
    succeeded: number
    skipped: number
    failed: number
    remaining: number
    notProcessed: number
    ratio: number
    sourceSetExcluded: number
    current: Readonly<{ orderIndex: number; filename: string }> | null
    cancellationRequested: boolean
    canCancel: boolean
}>
export type BatchTerminalResult = Readonly<{
    status: "completed" | "cancelled" | "failed"
    progress: BatchProgress
    startedAt: string
    finishedAt: string
    outcomes: readonly BatchFrameOutcome[]
    resources: BatchRunResult["resources"]
    fatalReason: string | null
}>
export type BatchSinkLease = Readonly<{ sink: BatchFrameOutputSink; close(): void | Promise<void> }>

const EMPTY_RESOURCES: BatchRunResult["resources"] = Object.freeze({ decodedOpened: 0, decodedClosed: 0,
    peakActiveDecoded: 0, sinkWriteAttempts: 0, sinkWriteSucceeded: 0 })

export class BatchRunController {
    private readonly sealed: SealedReference
    private readonly scan: SourceSetScan
    private readonly createSink: () => Promise<BatchSinkLease>
    private readonly cancellation = new AbortController()
    private readonly listeners = new Set<() => void>()
    private snapshot: BatchProgress
    private terminal: BatchTerminalResult | null = null
    private started = false

    constructor(sealed: SealedReference, scan: SourceSetScan, createSink: () => Promise<BatchSinkLease>) {
        // Copy the declarative inputs, not live FileSystem handles or source pixels.
        this.sealed = structuredClone(sealed)
        this.scan = { manifest: structuredClone(scan.manifest),
            runtime: { orderedFileHandles: scan.runtime.orderedFileHandles.map(row => ({ ...row })) } }
        this.createSink = createSink
        const totalPlanned = scan.manifest.processable.length
        this.snapshot = Object.freeze({ status: "idle", totalPlanned, settled: 0, succeeded: 0,
            skipped: 0, failed: 0, remaining: totalPlanned, notProcessed: totalPlanned, ratio: 0,
            sourceSetExcluded: scan.manifest.skipped.length, current: null,
            cancellationRequested: false, canCancel: false })
    }

    getSnapshot = (): BatchProgress => this.snapshot
    getResult = (): BatchTerminalResult | null => this.terminal
    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener)
        return () => { this.listeners.delete(listener) }
    }

    private publish(update: Partial<BatchProgress>): void {
        if (this.terminal) return
        this.snapshot = Object.freeze({ ...this.snapshot, ...update })
        for (const listener of this.listeners) listener()
    }

    requestCancel = (): boolean => {
        if (!this.snapshot.canCancel || this.cancellation.signal.aborted || this.terminal) return false
        this.cancellation.abort()
        this.publish({ status: "cancelling", cancellationRequested: true, canCancel: false })
        return true
    }

    private settle = (outcome: BatchFrameOutcome): void => {
        const settled = this.snapshot.settled + 1
        const remaining = this.snapshot.totalPlanned - settled
        this.publish({ settled, remaining, notProcessed: remaining, current: null,
            succeeded: this.snapshot.succeeded + Number(outcome.status === "succeeded"),
            failed: this.snapshot.failed + Number(outcome.status === "failed"),
            ratio: this.snapshot.totalPlanned === 0 ? 0 : settled / this.snapshot.totalPlanned,
            canCancel: remaining > 0 && !this.cancellation.signal.aborted })
    }

    async start(): Promise<BatchTerminalResult> {
        if (this.started) throw new Error("This Batch run has already started")
        this.started = true
        const startedAt = new Date().toISOString()
        let lease: BatchSinkLease | null = null
        let run: BatchRunResult | null = null
        let fatal = false
        let fatalReason: string | null = null
        try {
            this.publish({ status: "running", canCancel: this.snapshot.totalPlanned > 0 })
            if (this.snapshot.totalPlanned === 0 && this.scan.manifest.overallStatus === "no-valid-source-frames") {
                validateFinalFrameRecipe(this.sealed.recipe)
                run = Object.freeze({ status: "completed", attempted: 0, succeeded: 0, runtimeFailed: 0,
                    outcomes: Object.freeze([]), resources: EMPTY_RESOURCES })
            } else {
                lease = await this.createSink()
                run = await runBatchFrames(this.sealed, this.scan.manifest, this.scan.runtime, lease.sink,
                    undefined, { signal: this.cancellation.signal,
                        onFrameStarted: current => this.publish({ current,
                            canCancel: this.snapshot.remaining > 1 && !this.cancellation.signal.aborted }),
                        onFrameSettled: this.settle })
            }
        } catch (error) {
            fatal = true
            if (error instanceof BatchRunFatalError) run = error.partial
            const cause = error instanceof BatchRunFatalError ? error.cause : error
            if (cause instanceof BatchOutputSinkFatalError && cause.code === "quota") {
                fatalReason = "Browser temporary storage is full. Processing stopped. You can prepare a ZIP from completed frames or discard the run."
            }
        } finally {
            try { await lease?.close() } catch { fatal = true }
        }
        const status = fatal ? "failed" : run?.status ?? "failed"
        const progress: BatchProgress = Object.freeze({ ...this.snapshot, status, current: null,
            canCancel: false,
            ratio: this.snapshot.totalPlanned === 0 && status === "completed" ? 1 : this.snapshot.ratio })
        this.snapshot = progress
        this.terminal = Object.freeze({ status, progress, startedAt, finishedAt: new Date().toISOString(),
            outcomes: run?.outcomes ?? Object.freeze([]), resources: run?.resources ?? EMPTY_RESOURCES,
            fatalReason: status === "failed" ? fatalReason ?? "The batch could not finish safely. Completed outputs are retained." : null })
        for (const listener of this.listeners) listener()
        return this.terminal
    }
}
