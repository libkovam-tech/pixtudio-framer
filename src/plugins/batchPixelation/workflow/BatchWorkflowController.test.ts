import { describe, expect, it, vi } from "vitest"
import { BatchWorkflowController, type BatchWorkspace } from "./BatchWorkflowController"
import { batchTemplateFixture } from "../../../../tests/fixtures/batchTemplateFixture"
import { serializeBatchTemplate } from "../template/batchTemplate"
import { BatchRunController, type BatchSinkLease } from "../runner/BatchRunController"
import { BatchRunOwnership } from "../runner/batchRunOwnership"
import { PackagingController } from "../packaging/PackagingController"
import type { SourceSetScan } from "../sourceSet/scanSourceSet"

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>(done => { resolve = done })
    return { promise, resolve }
}
const sealed = () => batchTemplateFixture()
const file = () => new File([serializeBatchTemplate(sealed())], "test.pixtudio-batch")
function scan(): SourceSetScan {
    return { manifest: { version: 1, folderDisplayName: "EMPTY", referenceInputGeometry: sealed().referenceInputGeometry,
        sourceGeometry: null, overallStatus: "no-valid-source-frames", orderedCandidates: [], processable: [],
        skipped: [], collisions: [], counts: { candidates: 0, processable: 0, skipped: 0, collisions: 0 } },
        runtime: { orderedFileHandles: [] } }
}
function ready(controller = new BatchWorkflowController({ download: vi.fn(), discard: vi.fn(async () => {}) })) {
    expect(controller.configure()).toBe(true)
    const state = controller.getSnapshot()
    if (state.kind !== "authoring") throw new Error("Expected authoring")
    expect(controller.seal(sealed(), state.token)).toBe(true)
    return controller
}
function source(controller: BatchWorkflowController, value = scan()) {
    expect(controller.chooseSource()).toBe(true)
    const state = controller.getSnapshot()
    if (state.kind !== "source") throw new Error("Expected source")
    expect(controller.beginScan(state.token)).toBe(true)
    expect(controller.acceptScan(value, state.token)).toBe(true)
    controller.endScan(state.token)
    return state.token
}
function workspace(controller: BatchWorkflowController): BatchWorkspace {
    source(controller)
    expect(controller.continueSource()).toBe(true)
    const state = controller.getSnapshot()
    if (state.kind !== "workspace") throw new Error("Expected workspace")
    return state.workspace
}

describe("plugin-owned workflow guards", () => {
    it("allows only one authoring session, refuses entry/source/save actions before sealing", async () => {
        const c = new BatchWorkflowController()
        expect(await c.save()).toBe(false); expect(c.chooseSource()).toBe(false); expect(c.continueSource()).toBe(false)
        expect(c.configure()).toBe(true); expect(c.configure()).toBe(false); expect(c.beginOpen()).toBeNull()
        expect(await c.save()).toBe(false)
        expect(c.startOver()).toBe(true)
        expect(c.getSnapshot()).toEqual({ kind: "entry", error: null })
    })
    it("returns a rejected reference to Entry with its import error", () => {
        const c = new BatchWorkflowController()
        expect(c.rejectReference("invalid")).toBe(false)
        expect(c.configure()).toBe(true)
        expect(c.rejectReference("This file is not supported by PIXTUDIO.")).toBe(true)
        expect(c.getSnapshot()).toEqual({ kind: "entry", error: "This file is not supported by PIXTUDIO." })
        c.dismissEntryError()
        expect(c.getSnapshot()).toEqual({ kind: "entry", error: null })
    })
    it("does not publish invalid or stale authoring state", () => {
        const c = new BatchWorkflowController(); c.configure()
        const state = c.getSnapshot()
        if (state.kind !== "authoring") throw new Error("Expected authoring")
        expect(c.seal({ ...sealed(), recipe: {} } as unknown as ReturnType<typeof sealed>, state.token)).toBe(false)
        expect(c.getSnapshot().kind).toBe("authoring")
        c.startOver()
        expect(c.seal(sealed(), state.token)).toBe(false)
        expect(c.getSnapshot().kind).toBe("entry")
    })
    it("atomically fails invalid open, then permits a valid file", async () => {
        const c = new BatchWorkflowController()
        const token = c.beginOpen()!
        expect(await c.open(new File(["{}"], "bad.pixtudio-batch"), token)).toBe(false)
        expect(c.getSnapshot()).toEqual({ kind: "entry", error: "Not a Batch Pixelation template" })
        expect(await c.open(file(), c.beginOpen()!)).toBe(true)
        expect(c.getSnapshot().kind).toBe("template-ready")
    })
    it("rejects concurrent reads, and a late read cannot overwrite Start over/new authoring", async () => {
        const pending = deferred<ReturnType<typeof sealed>>()
        const read = vi.fn(() => pending.promise)
        const c = new BatchWorkflowController({ read })
        const token = c.beginOpen()!
        const first = c.open(file(), token)
        expect(await c.open(file(), token)).toBe(false)
        expect(read).toHaveBeenCalledTimes(1)
        expect(c.beginOpen()).toBeNull(); expect(c.configure()).toBe(false)
        c.startOver(); c.configure()
        pending.resolve(sealed())
        expect(await first).toBe(false)
        expect(c.getSnapshot().kind).toBe("authoring")
    })
    it("picker cancel is harmless; an old cancellation cannot cancel a newer picker", () => {
        const c = new BatchWorkflowController(); const old = c.beginOpen()!
        c.cancelOpen(old); expect(c.getSnapshot()).toEqual({ kind: "entry", error: null })
        const current = c.beginOpen()!
        c.cancelOpen(old); expect(c.getSnapshot()).toEqual({ kind: "opening", token: current })
    })
    it("repeat Save is identical and a detectable failure retains the frozen template", async () => {
        const blobs: Blob[] = []
        const download = vi.fn((blob: Blob) => { blobs.push(blob) })
        const c = ready(new BatchWorkflowController({ download }))
        const before = c.getSnapshot()
        expect(await c.save()).toBe(true); expect(await c.save()).toBe(true)
        expect(await blobs[0].text()).toBe(await blobs[1].text())
        expect(download.mock.calls[0][0].type).toBe("application/json")
        download.mockImplementationOnce(() => { throw new Error("sensitive detail") })
        const log = vi.spyOn(console, "error").mockImplementation(() => {})
        expect(await c.save()).toBe(false)
        expect(log).toHaveBeenCalledWith("[Batch Pixelation] Could not save recipe (starting browser download)",
            { name: "Error" })
        log.mockRestore()
        const after = c.getSnapshot()
        if (before.kind !== "template-ready" || after.kind !== "template-ready") throw new Error("Expected ready")
        expect(after.sealed).toBe(before.sealed)
        expect(after.notice).not.toContain("sensitive")
        expect(Reflect.set(after.sealed.recipe.grid, "rows", 20)).toBe(false)
    })
    it("dismissed desktop recipe picker does not start a fallback download", async () => {
        const download = vi.fn()
        const picker = vi.fn(async () => { throw new DOMException("dismissed", "AbortError") })
        vi.stubGlobal("window", { showSaveFilePicker: picker })
        vi.stubGlobal("navigator", { userAgent: "Desktop Chrome" })
        try {
            const c = new BatchWorkflowController({ download })
            expect(c.configure()).toBe(true)
            const state = c.getSnapshot()
            if (state.kind !== "authoring") throw new Error("Expected authoring")
            expect(await c.saveAuthoringRecipe(sealed(), state.token)).toBe("cancelled")
            expect(c.getSnapshot()).toEqual(state)
            expect(download).not.toHaveBeenCalled()
        } finally { vi.unstubAllGlobals() }
    })
    it("Back drops source handles and rejects late scan/end results", async () => {
        const c = ready(); const token = source(c)
        expect(c.beginScan(token)).toBe(true); expect(c.beginScan(token)).toBe(false)
        expect(c.continueSource()).toBe(false); expect(await c.save()).toBe(false)
        expect(c.back()).toBe(true)
        expect(c.acceptScan(scan(), token)).toBe(false); c.endScan(token)
        expect(c.getSnapshot().kind).toBe("template-ready")
        const newToken = source(c)
        expect(newToken).not.toBe(token)
        expect(c.acceptScan(scan(), token)).toBe(false)
    })
    it("Cancel returns an authored recipe to its editor and rejects late source scans", async () => {
        const c = ready()
        expect(c.chooseSource()).toBe(true)
        const state = c.getSnapshot()
        if (state.kind !== "source") throw new Error("Expected source")
        expect(c.beginScan(state.token)).toBe(true)
        expect(await c.cancelToAuthoringSafely()).toBe(true)
        expect(c.getSnapshot().kind).toBe("authoring")
        expect(c.acceptScan(scan(), state.token)).toBe(false)
        const returned = c.getSnapshot()
        if (returned.kind !== "authoring") throw new Error("Expected authoring")
        expect(c.seal(sealed(), returned.token)).toBe(true)
    })
    it("Cancel returns an imported recipe to Entry because it has no editable reference frame", async () => {
        const c = new BatchWorkflowController()
        expect(await c.open(file(), c.beginOpen()!)).toBe(true)
        expect(c.chooseSource()).toBe(true)
        expect(await c.cancelToAuthoringSafely()).toBe(true)
        expect(c.getSnapshot()).toEqual({ kind: "entry", error: null })
    })
    it("Cancel waits for an active run, discards outputs, and allows retry after discard failure", async () => {
        const lease = deferred<BatchSinkLease>()
        const discard = vi.fn(async () => {}).mockRejectedValueOnce(new Error("storage unavailable"))
        const c = ready(new BatchWorkflowController({ discard,
            createWorkspace: (sealed, sourceScan) => ({ id: "cancel-run", sealed, scan: sourceScan,
                runner: new BatchRunController(sealed, { ...sourceScan,
                    manifest: { ...sourceScan.manifest, overallStatus: "ready",
                        sourceGeometry: sealed.referenceInputGeometry,
                        processable: [{ orderIndex: 0, filename: "a.gif", outputName: "a.png" }],
                        counts: { candidates: 1, processable: 1, skipped: 0, collisions: 0 },
                        orderedCandidates: [{ orderIndex: 0, filename: "a.gif", detectedFormat: "gif",
                            decodedGeometry: sealed.referenceInputGeometry, plannedOutputName: "a.png",
                            status: "eligible", skipReason: null }] },
                    runtime: { orderedFileHandles: [{ orderIndex: 0, filename: "a.gif", handle: {
                        kind: "file", name: "a.gif", getFile: vi.fn() } }] } }, () => lease.promise),
                packager: new PackagingController() }) }))
        source(c)
        expect(c.continueSource()).toBe(true)
        expect(c.startRun()).toBe(true)
        expect(c.cancelRun()).toBe(true)
        expect(c.cancelRun()).toBe(false)
        expect(c.getSnapshot()).toMatchObject({ kind: "workspace", disposition: "idle" })
        expect(discard).not.toHaveBeenCalled()
        const cancelling = c.cancelToAuthoringSafely()
        expect(c.getSnapshot()).toMatchObject({ kind: "workspace", disposition: "discarding" })
        expect(discard).not.toHaveBeenCalled()
        lease.resolve({ sink: { writeFrame: vi.fn() }, close: vi.fn() })
        expect(await cancelling).toBe(false)
        expect(c.getSnapshot()).toMatchObject({ kind: "workspace", disposition: "discard-error" })
        expect(discard).toHaveBeenCalledTimes(1)
        expect(await c.cancelToAuthoringSafely()).toBe(true)
        expect(discard).toHaveBeenCalledTimes(2)
        expect(c.getSnapshot().kind).toBe("authoring")
    })
    it("Cancel waits for packaging cleanup and releases an unclaimed ZIP before returning", async () => {
        const build = deferred<Blob>()
        const discard = vi.fn(async () => {})
        const packager = new PackagingController(() => build.promise, vi.fn(), async () => {})
        const c = ready(new BatchWorkflowController({ discard,
            createWorkspace: (sealed, sourceScan) => ({ id: "packaging-run", sealed, scan: sourceScan,
                runner: new BatchRunController(sealed, sourceScan, vi.fn()), packager }) }))
        const w = workspace(c)
        expect(c.startRun()).toBe(true)
        await vi.waitFor(() => expect(w.runner.getResult()?.status).toBe("completed"))
        const packaging = c.package()
        const cancelling = c.cancelToAuthoringSafely()
        expect(c.getSnapshot()).toMatchObject({ kind: "workspace", disposition: "discarding" })
        build.resolve(new Blob(["ZIP"]))
        expect(await packaging).toBe(true)
        expect(await cancelling).toBe(true)
        expect(c.getSnapshot().kind).toBe("authoring")
        expect(await packager.downloadPrepared()).toBe("failed")
        expect(discard).not.toHaveBeenCalled()
    })
    it("Start over invalidates source scan ownership and releases all template/source state", () => {
        const c = ready(); const token = source(c)
        c.beginScan(token); c.startOver()
        expect(c.acceptScan(scan(), token)).toBe(false); c.endScan(token)
        expect(c.getSnapshot()).toEqual({ kind: "entry", error: null })
    })
    it("blocks reference/source geometry mismatch at the controller, not only the button", () => {
        const c = ready(); const value = scan()
        source(c, { ...value, manifest: { ...value.manifest, overallStatus: "blocked-reference-geometry" } })
        expect(c.continueSource()).toBe(false)
    })
    it("does not start an empty source set through the Gate 14 action", () => {
        const c = ready()
        source(c)
        expect(c.startSelectedRun()).toBe(false)
        expect(c.getSnapshot().kind).toBe("source")
    })
    it("Back/Start over also work after Continue, before the first Start Batch", () => {
        const c = ready()
        const w = workspace(c)
        expect(c.back()).toBe(true)
        expect(c.getSnapshot()).toEqual({ kind: "template-ready", sealed: w.sealed, notice: null })
        workspace(c)
        expect(c.startOver()).toBe(true)
        expect(c.getSnapshot()).toEqual({ kind: "entry", error: null })
    })
    it("zero-work terminal still packages; package/discard overlap guards retain one run", async () => {
        const build = deferred<Blob>(); const cleanup = deferred<void>()
        const c = ready(new BatchWorkflowController({ discard: () => cleanup.promise,
            createWorkspace: (sealed, scan) => ({ id: "unit-run", sealed, scan,
                runner: new BatchRunController(sealed, scan, vi.fn()),
                packager: new PackagingController(() => build.promise, vi.fn(), async () => {}) }) }))
        const w = workspace(c)
        expect(await c.package()).toBe(false)
        expect(c.startRun()).toBe(true); expect(c.startRun()).toBe(false)
        await vi.waitFor(() => expect(w.runner.getResult()?.status).toBe("completed"))
        const packaging = c.package()
        expect(await c.package()).toBe(false); expect(await c.discard()).toBe(false)
        expect(c.startOver()).toBe(false); expect(await c.save()).toBe(false); expect(c.chooseSource()).toBe(false)
        build.resolve(new Blob(["unit-archive"])); expect(await packaging).toBe(true)
        const discarded = c.discard()
        expect(await c.package()).toBe(false); expect(await c.discard()).toBe(false)
        cleanup.resolve(); expect(await discarded).toBe(true)
        const state = c.getSnapshot()
        if (state.kind !== "template-ready") throw new Error("Expected template retained")
        expect(state.sealed).toBe(w.sealed)
        expect("scan" in state).toBe(false); expect("workspace" in state).toBe(false)
    })
    it("repeated package calls cannot release ownership while the first package is still in flight", async () => {
        const build = deferred<Blob>()
        const owner = new BatchRunOwnership("owned-run")
        const release = vi.spyOn(owner, "release")
        const c = ready(new BatchWorkflowController({ createWorkspace: (sealed, scan) => ({ id: "owned-run", sealed, scan,
            runner: new BatchRunController(sealed, scan, vi.fn()),
            packager: new PackagingController(() => build.promise, vi.fn(), async () => {}),
            owner }) }))
        const w = workspace(c)
        expect(c.startRun()).toBe(true)
        await vi.waitFor(() => expect(w.runner.getResult()?.status).toBe("completed"))
        const first = c.package()
        expect(await c.package()).toBe(false)
        c.dispose()
        await Promise.resolve()
        expect(release).not.toHaveBeenCalled()
        build.resolve(new Blob(["unit-archive"]))
        expect(await first).toBe(true)
        await vi.waitFor(() => expect(release).toHaveBeenCalled())
    })
    it("run/cancellation blocks workflow transitions while an actual runner lease is in flight", async () => {
        const lease = deferred<BatchSinkLease>()
        const value = scan()
        const c = ready(new BatchWorkflowController({ createWorkspace: (sealed, scan) => ({ id: "held", sealed, scan,
            runner: new BatchRunController(sealed, { ...scan, manifest: { ...scan.manifest, overallStatus: "ready",
                sourceGeometry: sealed.referenceInputGeometry, processable: [{ orderIndex: 0, filename: "a.gif", outputName: "a.png" }],
                counts: { candidates: 1, processable: 1, skipped: 0, collisions: 0 },
                orderedCandidates: [{ orderIndex: 0, filename: "a.gif", detectedFormat: "gif", decodedGeometry: sealed.referenceInputGeometry,
                    plannedOutputName: "a.png", status: "eligible", skipReason: null }] },
                runtime: { orderedFileHandles: [{ orderIndex: 0, filename: "a.gif", handle: {
                    kind: "file", name: "a.gif", getFile: vi.fn() } }] } }, () => lease.promise),
            packager: new PackagingController() }) }))
        source(c, value); c.continueSource()
        const state = c.getSnapshot()
        if (state.kind !== "workspace") throw new Error("Expected workspace")
        c.startRun()
        expect(state.workspace.runner.getSnapshot().status).toBe("running")
        expect(c.configure()).toBe(false); expect(c.beginOpen()).toBeNull(); expect(await c.save()).toBe(false)
        expect(c.chooseSource()).toBe(false); expect(c.back()).toBe(false); expect(c.continueSource()).toBe(false)
        expect(c.startOver()).toBe(false); expect(await c.discard()).toBe(false); expect(await c.package()).toBe(false)
        state.workspace.runner.requestCancel()
        expect(await c.discard()).toBe(false)
        lease.resolve({ sink: { writeFrame: vi.fn() }, close: vi.fn() })
        await vi.waitFor(() => expect(state.workspace.runner.getResult()?.status).toBe("cancelled"))
    })
    it("discard failure retains run and allows retry; next run gets an independent ID", async () => {
        const discard = vi.fn(async () => {}).mockRejectedValueOnce(new Error("private"))
        const c = ready(new BatchWorkflowController({ discard }))
        const first = workspace(c)
        expect(await c.discard()).toBe(false)
        expect(c.getSnapshot()).toMatchObject({ kind: "workspace", disposition: "discard-error" })
        expect(await c.retryDiscard()).toBe(true)
        const second = workspace(c)
        expect(second.id).not.toBe(first.id)
        expect(second.sealed).toBe(first.sealed)
        expect(second.runner).not.toBe(first.runner)
        expect(second.packager).not.toBe(first.packager)
    })
    it("remount is fresh and disposal prevents late template admission", async () => {
        const pending = deferred<ReturnType<typeof sealed>>()
        const c = new BatchWorkflowController({ read: () => pending.promise })
        const task = c.open(file(), c.beginOpen()!)
        c.dispose(); pending.resolve(sealed()); expect(await task).toBe(false)
        expect(new BatchWorkflowController().getSnapshot()).toEqual({ kind: "entry", error: null })
    })
})
