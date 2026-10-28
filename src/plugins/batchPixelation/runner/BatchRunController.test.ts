import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BatchRunController, type BatchSinkLease } from "./BatchRunController.ts"
import { BatchOutputSinkFatalError, runBatchFrames, type BatchFrameOutputSink } from "./runBatchFrames.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"
import type { SourceSetScan } from "../sourceSet/scanSourceSet.ts"

const mocks = vi.hoisted(() => ({ decode: vi.fn(), render: vi.fn(), validate: vi.fn(), preflight: vi.fn() }))
vi.mock("../../../editor/fileIntakeSecurity.ts", () => ({
    decodeAndValidateRasterImageFile: mocks.decode, FileIntakeError: class extends Error {},
}))
vi.mock("../render/finalFrame.ts", () => ({ renderFinalFrame: mocks.render, validateFinalFrameRecipe: mocks.validate }))
vi.mock("../staticRasterPolicy.ts", () => ({ assertStaticBatchRasterFile: mocks.preflight,
    BatchRasterPreflightError: class extends Error {} }))

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}

function fixture(count = 4) {
    const events: string[] = []
    const writes: number[] = []
    const entries = Array.from({ length: count }, (_, orderIndex) => ({ orderIndex,
        filename: `frame${orderIndex}.png`, outputName: `frame${orderIndex}.png` }))
    const geometry = { width: 1, height: 1 }
    const scan: SourceSetScan = {
        manifest: { version: 1, folderDisplayName: "TEST", referenceInputGeometry: geometry,
            sourceGeometry: count === 0 ? null : geometry,
            overallStatus: count === 0 ? "no-valid-source-frames" : "ready",
            processable: entries, skipped: [], collisions: [],
            counts: { candidates: count, processable: count, skipped: 0, collisions: 0 },
            orderedCandidates: entries.map(entry => ({ orderIndex: entry.orderIndex, filename: entry.filename,
                detectedFormat: "png", decodedGeometry: geometry, plannedOutputName: entry.outputName,
                status: "eligible", skipReason: null })) },
        runtime: { orderedFileHandles: entries.map(entry => ({ ...entry, handle: { kind: "file",
            name: entry.filename, async getFile() {
                events.push(`open:${entry.orderIndex}`)
                return new File(["fixture"], entry.filename, { type: "image/png" })
            } } })) },
    }
    // Pixel semantics are covered by browser tests; these doubles control settlement ordering.
    const sealed = { referenceInputGeometry: geometry, recipe: {} } as unknown as SealedReference
    mocks.decode.mockImplementation(async (file: File) => {
        const index = entries.findIndex(entry => entry.filename === file.name)
        events.push(`decode:${index}`)
        return { width: 1, height: 1, close() { events.push(`cleanup:${index}`) } }
    })
    mocks.render.mockImplementation(() => ({ width: 1, height: 1,
        toBlob(callback: BlobCallback) { callback(new Blob(["png"], { type: "image/png" })) } }))
    const sink: BatchFrameOutputSink = { async writeFrame(frame) {
        events.push(`sink:${frame.orderIndex}`); writes.push(frame.orderIndex)
    } }
    const createSink = async (): Promise<BatchSinkLease> => ({ sink, close() { events.push("close-sink") } })
    const controller = new BatchRunController(sealed, scan, createSink)
    controller.subscribe(() => {
        const p = controller.getSnapshot()
        events.push(`${p.status}:${p.settled}:${p.current?.orderIndex ?? "none"}`)
    })
    return { controller, scan, sealed, sink, events, writes, createSink }
}

beforeEach(() => { vi.resetAllMocks() })
afterEach(() => { vi.unstubAllGlobals() })

describe("Batch cooperative progress and partial results", () => {
    it("completes with immutable settled counters, one active decode and sink writes", async () => {
        const f = fixture()
        const snapshots: ReturnType<typeof f.controller.getSnapshot>[] = []
        f.controller.subscribe(() => snapshots.push(f.controller.getSnapshot()))
        const result = await f.controller.start()
        expect(result.status).toBe("completed")
        expect(result.progress).toMatchObject({ totalPlanned: 4, settled: 4, succeeded: 4,
            failed: 0, skipped: 0, notProcessed: 0, ratio: 1, canCancel: false })
        expect(f.writes).toEqual([0, 1, 2, 3])
        expect(result.resources).toEqual({ decodedOpened: 4, decodedClosed: 4, peakActiveDecoded: 1,
            sinkWriteAttempts: 4, sinkWriteSucceeded: 4 })
        expect(snapshots.every((p, i) => i === 0 || p.settled >= snapshots[i - 1].settled)).toBe(true)
        expect(snapshots.filter(p => p.current).map(p => p.settled)).toEqual([0, 1, 2, 3])
        expect(Object.isFrozen(result)).toBe(true)
        expect(Object.isFrozen(result.outcomes)).toBe(true)
        expect(Object.isFrozen(result.outcomes[0])).toBe(true)
        expect(Object.isFrozen(result.outcomes[0].outputGeometry)).toBe(true)
        expect(Object.isFrozen(result.progress)).toBe(true)
        expect(result.finishedAt >= result.startedAt).toBe(true)
    })

    it("cancels before the first frame without opening a source or writing output", async () => {
        const f = fixture()
        const lease = deferred<BatchSinkLease>()
        const controller = new BatchRunController(f.sealed, f.scan, () => lease.promise)
        const running = controller.start()
        expect(controller.requestCancel()).toBe(true)
        expect(controller.requestCancel()).toBe(false)
        lease.resolve(await f.createSink())
        const result = await running
        expect(result.status).toBe("cancelled")
        expect(result.progress).toMatchObject({ settled: 0, succeeded: 0, failed: 0, skipped: 0,
            notProcessed: 4, ratio: 0 })
        expect(result.outcomes).toEqual([])
        expect(mocks.decode).not.toHaveBeenCalled()
        expect(f.events).toEqual(["close-sink"])
    })

    it("holds an in-flight PNG encode, cancels idempotently, writes and cleans it before stopping", async () => {
        const f = fixture()
        const entered = deferred<void>()
        let release!: BlobCallback
        mocks.render.mockImplementation(() => ({ width: 1, height: 1, toBlob(callback: BlobCallback) {
            release = callback; entered.resolve()
        } }))
        const running = f.controller.start()
        await entered.promise
        expect(f.controller.getSnapshot()).toMatchObject({ settled: 0, current: { orderIndex: 0 } })
        f.events.push("cancel-requested")
        expect(f.controller.requestCancel()).toBe(true)
        expect(f.controller.requestCancel()).toBe(false)
        release(new Blob(["png"], { type: "image/png" }))
        const result = await running
        expect(f.events).toEqual(["running:0:none", "running:0:0", "open:0", "decode:0",
            "cancel-requested", "cancelling:0:0", "sink:0", "cleanup:0", "cancelling:1:none",
            "close-sink", "cancelled:1:none"])
        expect(result.progress).toMatchObject({ settled: 1, succeeded: 1, notProcessed: 3, ratio: 0.25 })
        expect(result.resources.decodedOpened).toBe(result.resources.decodedClosed)
        expect(f.writes).toEqual([0])
    })

    it("cancels between frames after several successes, preserving only accepted outputs", async () => {
        const f = fixture(10)
        f.controller.subscribe(() => {
            if (f.controller.getSnapshot().settled === 4) f.controller.requestCancel()
        })
        const result = await f.controller.start()
        expect(result.status).toBe("cancelled")
        expect(result.progress).toMatchObject({ settled: 4, succeeded: 4, notProcessed: 6, ratio: 0.4 })
        expect(f.writes).toEqual([0, 1, 2, 3])
        expect(f.events.filter(e => e.startsWith("open:"))).toEqual(["open:0", "open:1", "open:2", "open:3"])
        expect(f.events.indexOf("cleanup:3")).toBeLessThan(f.events.indexOf("cancelling:4:none"))
    })

    it("keeps scan exclusions separate; runtime read failures retain Gate 8's failed vocabulary", async () => {
        const f = fixture()
        const scan: SourceSetScan = { ...f.scan, manifest: { ...f.scan.manifest,
            counts: { ...f.scan.manifest.counts, candidates: 5, skipped: 1 },
            orderedCandidates: [...f.scan.manifest.orderedCandidates, { orderIndex: 4,
                filename: "excluded.webp", detectedFormat: null, decodedGeometry: null,
                plannedOutputName: null, status: "skipped", skipReason: "unsupported-format" }],
            skipped: [{ orderIndex: 4, filename: "excluded.webp", reason: "unsupported-format" }] } }
        const controller = new BatchRunController(f.sealed, scan, f.createSink)
        mocks.decode.mockRejectedValueOnce(new DOMException("Unavailable", "NotReadableError"))
        controller.subscribe(() => { if (controller.getSnapshot().settled === 1) controller.requestCancel() })
        const result = await controller.start()
        expect(result.status).toBe("cancelled")
        expect(result.progress).toMatchObject({ settled: 1, failed: 1, skipped: 0, sourceSetExcluded: 1,
            notProcessed: 3 })
        expect(result.outcomes[0].reason).toBe("source-read-failed")
    })

    it("counts an isolated failed frame while cancelling and releases its bitmap", async () => {
        const f = fixture()
        f.sink.writeFrame = async () => {
            f.controller.requestCancel()
            throw new Error("Isolated sink error")
        }
        const result = await f.controller.start()
        expect(result.status).toBe("cancelled")
        expect(result.progress).toMatchObject({ settled: 1, failed: 1, succeeded: 0, notProcessed: 3 })
        expect(result.outcomes[0].reason).toBe("sink-write-failed")
        expect(result.resources.decodedClosed).toBe(1)
    })

    it("cancellation wins before the last frame starts", async () => {
        const f = fixture(2)
        f.controller.subscribe(() => { if (f.controller.getSnapshot().settled === 1) f.controller.requestCancel() })
        const result = await f.controller.start()
        expect(result.status).toBe("cancelled")
        expect(f.writes).toEqual([0])
    })

    it("completion wins over cancellation during the final frame and after final settlement", async () => {
        const f = fixture(1)
        f.sink.writeFrame = async frame => {
            f.writes.push(frame.orderIndex)
            expect(f.controller.requestCancel()).toBe(false)
        }
        f.controller.subscribe(() => {
            if (f.controller.getSnapshot().settled === 1) expect(f.controller.requestCancel()).toBe(false)
        })
        const result = await f.controller.start()
        expect(result.status).toBe("completed")
        expect(result.progress).toMatchObject({ settled: 1, ratio: 1, cancellationRequested: false })
        const json = JSON.stringify(result)
        expect(f.controller.requestCancel()).toBe(false)
        expect(JSON.stringify(f.controller.getResult())).toBe(json)
    })

    it("a late external stop during the final frame cannot turn normal completion into cancelled", async () => {
        const f = fixture(1)
        const cancellation = new AbortController()
        f.sink.writeFrame = async frame => { f.writes.push(frame.orderIndex); cancellation.abort() }
        const result = await runBatchFrames(f.sealed, f.scan.manifest, f.scan.runtime, f.sink,
            undefined, { signal: cancellation.signal })
        expect(cancellation.signal.aborted).toBe(true)
        expect(result.status).toBe("completed")
        expect(result.attempted).toBe(1)
        expect(result.resources.decodedClosed).toBe(1)
    })

    it.each([false, true])("fatal sink failure wins with cancellation=%s; settled outputs survive", async cancel => {
        const f = fixture()
        const sink = f.sink.writeFrame
        f.sink.writeFrame = async frame => {
            if (frame.orderIndex === 1) {
                if (cancel) f.controller.requestCancel()
                throw new BatchOutputSinkFatalError("Sensitive error detail must not enter the UI")
            }
            await sink(frame)
        }
        const result = await f.controller.start()
        expect(result.status).toBe("failed")
        expect(result.progress).toMatchObject({ settled: 1, succeeded: 1, failed: 0, notProcessed: 3,
            cancellationRequested: cancel })
        expect(result.fatalReason).not.toContain("Sensitive")
        expect(f.writes).toEqual([0])
        expect(result.resources).toMatchObject({ decodedOpened: 2, decodedClosed: 2, sinkWriteSucceeded: 1 })
    })

    it("a cleanup failure cannot masquerade as safely cancelled", async () => {
        const f = fixture()
        mocks.decode.mockResolvedValue({ width: 1, height: 1, close() { throw new Error("close failed") } })
        f.sink.writeFrame = async frame => { f.writes.push(frame.orderIndex); f.controller.requestCancel() }
        const result = await f.controller.start()
        expect(result.status).toBe("failed")
        expect(result.progress.settled).toBe(0)
        expect(result.resources).toMatchObject({ decodedOpened: 1, decodedClosed: 0, sinkWriteSucceeded: 1 })
        expect(f.writes).toEqual([0])
    })

    it("sink finalization failure overrides cancellation without erasing settled output", async () => {
        const f = fixture()
        const controller = new BatchRunController(f.sealed, f.scan, async () => ({ sink: f.sink,
            close() { throw new Error("finalization failure") } }))
        controller.subscribe(() => { if (controller.getSnapshot().settled === 1) controller.requestCancel() })
        const result = await controller.start()
        expect(result.status).toBe("failed")
        expect(result.progress).toMatchObject({ settled: 1, succeeded: 1, cancellationRequested: true })
    })

    it("rejects concurrent/repeated starts and source mutation cannot alter the captured plan", async () => {
        const f = fixture()
        const running = f.controller.start()
        await expect(f.controller.start()).rejects.toThrow("already started")
        Reflect.set(f.scan.manifest.processable[0], "filename", "changed.png")
        const result = await running
        expect(result.outcomes[0].sourceFilename).toBe("frame0.png")
        await expect(f.controller.start()).rejects.toThrow("already started")
    })

    it("handles zero planned frames explicitly without division by zero", async () => {
        const f = fixture(0)
        const result = await f.controller.start()
        expect(result.status).toBe("completed")
        expect(result.progress).toMatchObject({ totalPlanned: 0, settled: 0, ratio: 1, notProcessed: 0 })
        expect(f.writes).toEqual([])
        expect(f.events).toEqual(["running:0:none", "completed:0:none"])
        expect(f.controller.requestCancel()).toBe(false)
    })

    it("reports a sink setup failure safely with no processing", async () => {
        const f = fixture()
        const controller = new BatchRunController(f.sealed, f.scan, async () => { throw new Error("storage failed") })
        const result = await controller.start()
        expect(result.status).toBe("failed")
        expect(result.progress.settled).toBe(0)
        expect(f.events).toEqual([])
    })

    it("preserves Gate 8's throwing fatal/invalid-plan contract for existing callers", async () => {
        const f = fixture()
        await expect(runBatchFrames(f.sealed, { ...f.scan.manifest, version: 2 } as unknown as
            SourceSetScan["manifest"], f.scan.runtime, f.sink)).rejects.toThrow("Invalid or incompatible")
        f.sink.writeFrame = async () => { throw new BatchOutputSinkFatalError("Fatal sink") }
        await expect(runBatchFrames(f.sealed, f.scan.manifest, f.scan.runtime, f.sink)).rejects.toMatchObject({
            message: "Fatal sink", partial: { status: "failed", attempted: 1, outcomes: [],
                resources: { decodedOpened: 1, decodedClosed: 1 } },
        })
    })
})
