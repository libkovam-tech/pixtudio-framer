import { runBatchFrames, type BatchFrameTiming, type BatchRunResult } from "../runner/runBatchFrames.ts"
import type { SourceSetScan } from "../sourceSet/scanSourceSet.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"
import { classifyPng, referenceIdentity, samplePositions, statistics } from "./rafValidationEvidence.ts"
import { verifyExactnessSample, type ExactnessSample } from "./rafValidationExactness.ts"

export type ValidationRow = {
    orderIndex: number; sourceFilename: string; outputName: string
    timing: BatchFrameTiming; pngCallbackMs: number | null
    pngCallState: { visibility: DocumentVisibilityState; focused: boolean; elapsedMs: number } | null
    pngCallbackState: { visibility: DocumentVisibilityState; focused: boolean; elapsedMs: number } | null
    status: "succeeded" | "failed" | "unresolved"; reason: string | null
    classification: ReturnType<typeof classifyPng> | null; pngBytes: number | null
    sourceSnapshot: { size: number; lastModified: number; type: string } | null
    visibility: DocumentVisibilityState; focused: boolean; explicitRafCount: number; elapsedMs: number
}
export type VisibilityEvent = { event: string; elapsedMs: number; visibility: DocumentVisibilityState;
    focused: boolean; orderIndex: number | null; completedFrames: number }
export type ValidationReport = Awaited<ReturnType<typeof runRafValidation>>
let active = false

export async function startWithAdapter(mode: "OFF" | "ON", state: { count: number; waitMs: number },
    start: () => Promise<void>, frame: (callback: FrameRequestCallback) => number = requestAnimationFrame) {
    if (mode === "ON") {
        const before = performance.now()
        state.count++
        await new Promise<void>(resolve => frame(() => resolve()))
        state.waitMs = performance.now() - before
    }
    await start()
}

export async function runRafValidation(sealed: SealedReference, scan: SourceSetScan, mode: "OFF" | "ON",
    onProgress: (row: ValidationRow) => void, onCurrent?: (filename: string) => void) {
    if (active) throw new Error("A research measurement is already active")
    active = true
    const intent = performance.now()
    const startedAt = new Date().toISOString()
    const adapter = { count: 0, waitMs: 0 }
    const events: VisibilityEvent[] = []
    const rows: ValidationRow[] = []
    let currentIndex: number | null = null
    const state = () => ({ visibility: document.visibilityState, focused: document.hasFocus(),
        elapsedMs: performance.now() - intent })
    const event = (name: string) => events.push({ event: name, ...state(), orderIndex: currentIndex,
        completedFrames: rows.length })
    const listeners = ["visibilitychange", "focus", "blur"].map(name => {
        const callback = () => event(name)
        const target = name === "visibilitychange" ? document : window
        target.addEventListener(name, callback)
        return () => target.removeEventListener(name, callback)
    })
    event("start-intent")
    const targets = new Set(samplePositions(scan.manifest.processable.length)
        .map(position => scan.manifest.processable[position].orderIndex))
    const transitionTargets = new Set<number>()
    let takeTransitionSample = false
    const transitionListener = () => { takeTransitionSample = true }
    document.addEventListener("visibilitychange", transitionListener)
    const sourceSamples = new Map<number, { file: File; handle: ExactnessSample["handle"] }>()
    const samples: ExactnessSample[] = []
    const pngTimes = new Map<number, { ms: number; call: ReturnType<typeof state>; callback: ReturnType<typeof state> }>()
    const writes = new Map<number, number>()
    const sourceMetadata = new Map<number, { size: number; lastModified: number; type: string }>()
    let peakRetainedPngBlobs = 0
    let setupMs: number | null = null
    let runnerResult: BatchRunResult | null = null
    let fatal: string | null = null
    let runDurationMs = 0
    let verificationDurationMs = 0
    const native = HTMLCanvasElement.prototype.toBlob
    const observed: typeof native = function (this: HTMLCanvasElement, callback, type, quality) {
        if (type !== "image/png" || currentIndex === null) return native.call(this, callback, type, quality)
        const index = currentIndex
        const call = state()
        const before = performance.now()
        return native.call(this, blob => {
            const ms = performance.now() - before
            pngTimes.set(index, { ms, call, callback: state() })
            callback(blob)
        }, type, quality)
    }
    const exactness: Awaited<ReturnType<typeof verifyExactnessSample>>[] = []
    try {
        const runtime = { orderedFileHandles: scan.runtime.orderedFileHandles.map(row => ({ ...row,
            handle: { kind: "file" as const, name: row.handle.name, async getFile() {
                currentIndex = row.orderIndex
                onCurrent?.(row.filename)
                if (takeTransitionSample && transitionTargets.size < 2) {
                    transitionTargets.add(row.orderIndex)
                    takeTransitionSample = false
                }
                const file = await row.handle.getFile()
                sourceMetadata.set(row.orderIndex, { size: file.size, lastModified: file.lastModified, type: file.type })
                if (targets.has(row.orderIndex) || transitionTargets.has(row.orderIndex)) {
                    sourceSamples.set(row.orderIndex, { file, handle: row.handle })
                }
                return file
            } },
        })) }
        await startWithAdapter(mode, adapter, async () => {
            event("runner-start")
            HTMLCanvasElement.prototype.toBlob = observed
            try {
                runnerResult = await runBatchFrames(sealed, scan.manifest, runtime, {
                    async writeFrame(output) {
                        writes.set(output.orderIndex, output.png.size)
                        const source = sourceSamples.get(output.orderIndex)
                        if (source && samples.length < 7) {
                            samples.push({ orderIndex: output.orderIndex, source: source.file,
                                handle: source.handle, png: output.png })
                            peakRetainedPngBlobs = Math.max(peakRetainedPngBlobs, samples.length)
                        }
                    },
                }, {
                    onSetup(ms) { setupMs = ms },
                    onFrame(timing) {
                        const entry = scan.manifest.orderedCandidates[timing.orderIndex]
                        const png = pngTimes.get(timing.orderIndex)
                        const row: ValidationRow = { orderIndex: timing.orderIndex,
                            sourceFilename: entry.filename, outputName: entry.plannedOutputName!, timing,
                            pngCallbackMs: png?.ms ?? null, pngCallState: png?.call ?? null,
                            pngCallbackState: png?.callback ?? null, status: "unresolved", reason: null,
                            classification: null, pngBytes: writes.get(timing.orderIndex) ?? null,
                            sourceSnapshot: sourceMetadata.get(timing.orderIndex) ?? null,
                            ...state(), explicitRafCount: adapter.count }
                        rows.push(row)
                        currentIndex = null
                        onProgress(row)
                    },
                })
            } finally {
                HTMLCanvasElement.prototype.toBlob = native
            }
        })
    } catch (error) {
        fatal = error instanceof Error ? error.message : "Validation run failed"
    } finally {
        runDurationMs = performance.now() - intent
        event("runner-settled")
        for (const remove of listeners) remove()
        document.removeEventListener("visibilitychange", transitionListener)
        // Never keep research observation installed during post-run exactness or editor use.
        if (HTMLCanvasElement.prototype.toBlob === observed) HTMLCanvasElement.prototype.toBlob = native
        try {
            const before = performance.now()
            for (const sample of samples) exactness.push(await verifyExactnessSample(sample, sealed))
            verificationDurationMs = performance.now() - before
        } finally {
            samples.length = 0
            sourceSamples.clear()
            active = false
        }
    }
    const result = runnerResult as BatchRunResult | null
    const outcomes = new Map(result?.outcomes.map(outcome => [outcome.orderIndex, outcome]))
    for (const row of rows) {
        const outcome = outcomes.get(row.orderIndex)
        row.status = outcome?.status ?? "unresolved"
        row.reason = outcome?.reason ?? (outcome ? null : fatal ?? "Runner outcome unavailable")
        row.classification = row.status === "succeeded" && row.pngCallbackMs !== null
            ? classifyPng(row.pngCallbackMs) : null
    }
    const succeeded = rows.filter(row => row.status === "succeeded")
    const png = succeeded.flatMap(row => row.pngCallbackMs === null ? [] : [row.pngCallbackMs])
    return { version: 1, researchOnly: true, mode, startedAt,
        environment: { userAgent: navigator.userAgent, viewport: { width: innerWidth, height: innerHeight },
            launchFlags: "NOT VERIFIED: Owner browser launch is not inspected" },
        sealed, recipeIdentity: await referenceIdentity(sealed), manifest: scan.manifest,
        adapter: { explicitRafCount: adapter.count, waitMs: adapter.waitMs },
        setupMs, runDurationMs, verificationDurationMs, rows, events, exactness, fatal,
        resources: result?.resources ?? null, resourceStatus: result ? "RUNNER_COUNTERS_AVAILABLE" : "NOT_VERIFIED_AFTER_FATAL",
        retainedPngBlobs: samples.length, peakRetainedPngBlobs,
        summary: { planned: scan.manifest.processable.length, attempted: rows.length,
            succeeded: result?.succeeded ?? null, failed: result?.runtimeFailed ?? null,
            skipped: scan.manifest.counts.skipped,
            fast: succeeded.filter(row => row.classification === "FAST").length,
            slow: succeeded.filter(row => row.classification === "SLOW-PLATEAU").length,
            other: succeeded.filter(row => row.classification === "OTHER").length,
            png: statistics(png), totalFrame: statistics(rows.map(row => row.timing.totalMs)),
            first10: rows.slice(0, 10), last10: rows.slice(-10),
            slowest10: [...succeeded].sort((a, b) => (b.pngCallbackMs ?? 0) - (a.pngCallbackMs ?? 0)).slice(0, 10) },
        limitations: ["Not ZIP/export throughput", "No Research Abort; runner unchanged",
            "Failed-stage timings may be absent, not zero", "Resource counters cover runner, not post-run exactness",
            "Up to seven PNG/source samples retained only until post-run verification",
            "Live UI paints are natural environment activity, not adapter rAF calls"] }
}
