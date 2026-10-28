import { describe, expect, it, vi } from "vitest"
import { parseStoredZip } from "../../../../tests/fixtures/parseStoredZip.ts"
import { controlledPng } from "../../../../tests/fixtures/staticRasterBytes.ts"
import { batchReport, archiveFilename, type ArchiveContext } from "./batchReport.ts"
import { packageBatch } from "./packageBatch.ts"
import { PackagingController, downloadArchive } from "./PackagingController.ts"
import { ZipArchive, assertArchiveName } from "./zipArchive.ts"
import type { BatchOutputReader } from "../runner/batchOutputStore.ts"
import type { SealedReference } from "../authoring/BatchReferenceEnvelope.ts"

function fixture(total = 5, settled = total, status: ArchiveContext["terminal"]["status"] = "completed", failures = 0) {
    const geometry = { width: 1, height: 1 }
    const png = new Blob([Uint8Array.from(controlledPng(false))], { type: "image/png" })
    const planned = Array.from({ length: total }, (_, orderIndex) => ({ orderIndex,
        filename: `${orderIndex === 0 ? "Frame" : "frame"}${orderIndex}.gif`,
        outputName: `${orderIndex === 0 ? "Frame" : "frame"}${orderIndex}.png` }))
    const outcomes = planned.slice(0, settled).map((row, index) => ({ orderIndex: row.orderIndex,
        sourceFilename: row.filename, outputName: row.outputName,
        status: index < failures ? "failed" as const : "succeeded" as const,
        reason: index < failures ? "invalid-or-corrupt" as const : null,
        pngBytes: index < failures ? null : png.size,
        outputGeometry: index < failures ? null : geometry }))
    const context: ArchiveContext = { runId: "run", sealed: {
        referenceInputGeometry: geometry, recipe: { version: 1, pipeline: "crop-preparation-smart-sampling-final-palette-png-v2" },
    } as SealedReference, manifest: {
        version: 1, folderDisplayName: "TEST", referenceInputGeometry: geometry, sourceGeometry: geometry,
        overallStatus: total ? "ready" : "no-valid-source-frames", processable: planned, orderedCandidates: [], skipped: [], collisions: [],
        counts: { candidates: total, processable: total, skipped: 0, collisions: 0 },
    }, terminal: {
        status, startedAt: "2026-09-27T10:00:00.000Z", finishedAt: "2026-09-27T10:01:00.000Z", outcomes,
        fatalReason: status === "failed" ? "C:\\private\\trace\nstack" : null,
        progress: { status, totalPlanned: total, settled, succeeded: settled - failures, failed: failures,
            skipped: 0, remaining: total - settled, notProcessed: total - settled,
            ratio: total ? settled / total : 1, sourceSetExcluded: 0, current: null, cancellationRequested: status === "cancelled", canCancel: false },
        resources: { decodedOpened: settled, decodedClosed: settled, peakActiveDecoded: 1, sinkWriteAttempts: settled - failures, sinkWriteSucceeded: settled - failures },
    } }
    const rows = outcomes.filter(row => row.status === "succeeded").map(row => ({
        runId: "run", orderIndex: row.orderIndex, sourceFilename: row.sourceFilename, outputName: row.outputName,
        width: 1, height: 1, png,
    }))
    const reader: BatchOutputReader = { keys: vi.fn(async () => rows.map(row => [row.runId, row.orderIndex])),
        read: vi.fn(async index => rows.find(row => row.orderIndex === index)), close: vi.fn() }
    return { context, rows, reader, open: async () => reader, png }
}

describe("Gate 10 settled-output packaging", () => {
    it.each([
        [5, 5, "completed", 0], [8, 3, "cancelled", 0], [10, 4, "cancelled", 1],
        [8, 2, "failed", 0], [8, 0, "cancelled", 0], [0, 0, "completed", 0],
        [8, 0, "failed", 0], [3, 3, "completed", 3],
    ] as const)("packages %i/%i %s with %i failures", async (total, settled, status, failures) => {
        const f = fixture(total, settled, status, failures)
        const before = JSON.stringify(f.context)
        const progress: number[] = []
        const zip = await packageBatch(f.context, (_, count) => progress.push(count), f.open)
        const entries = parseStoredZip(new Uint8Array(await zip.arrayBuffer()))
        expect([...entries.keys()]).toEqual(["batch_report.txt", ...f.rows.map(row => row.outputName)])
        for (const row of f.rows) expect(entries.get(row.outputName)).toEqual(new Uint8Array(await row.png.arrayBuffer()))
        const report = new TextDecoder().decode(entries.get("batch_report.txt"))
        expect(report).toContain(`Processed: ${settled} / ${total}`)
        expect(report).toContain(`Not processed: ${total - settled}`)
        expect(report).toContain(`Runtime failed: ${failures}`)
        expect(report).not.toContain("C:\\private")
        expect(report).not.toContain("\r")
        expect(report.charCodeAt(0)).not.toBe(0xfeff)
        expect(progress.every((value, index) => !index || value >= progress[index - 1])).toBe(true)
        expect(progress.at(-1)).toBe(settled - failures)
        expect(f.reader.close).toHaveBeenCalledOnce()
        expect(JSON.stringify(f.context)).toBe(before)
    })

    it("escapes display names, counts exclusions/collisions separately and omits private paths", () => {
        const f = fixture(8, 3, "cancelled")
        f.context = { ...f.context, manifest: { ...f.context.manifest, folderDisplayName: "C:\\PRIVATE\\folder\n[Run]",
            skipped: [{ orderIndex: 9, filename: "x\n[Run].gif", reason: "output-name-collision" }],
            collisions: [{ outputName: "Frame0.png", winnerIndex: 0, winnerFilename: "Frame0.gif", skippedIndex: 9, skippedFilename: "x\n[Run].gif" }],
            counts: { candidates: 9, processable: 8, skipped: 1, collisions: 1 } } }
        const report = batchReport(f.context)
        expect(report).toContain('"x\\n[Run].gif": "output-name-collision"')
        expect(report).toContain("First not-processed index: 3")
        expect(report).toContain('First not-processed filename: "frame3.gif"')
        expect(report).not.toContain("PRIVATE")
        expect(report.match(/^\[Run\]$/gm)).toHaveLength(1)
        expect(archiveFilename(f.context)).toBe("PIXTUDIO_folder__Run__Cancelled_20260927T100100000Z.zip")
        expect(batchReport(f.context)).toBe(report)
    })

    it.each(["../frame.png", "..\\frame.png", "/frame.png", "C:frame.png", "sub/frame.png", "a\u0000.png", "frame_\ud800.png"])("rejects unsafe ZIP name %s", name => {
        expect(() => assertArchiveName(name)).toThrow()
    })

    it("preserves UTF-8 entry names and rejects corrupted archive bytes", async () => {
        const writer = new ZipArchive()
        await writer.append("frame_\u00e9.png", new Blob(["exact payload"]))
        const bytes = new Uint8Array(await writer.finish().arrayBuffer())
        expect(new TextDecoder().decode(parseStoredZip(bytes).get("frame_\u00e9.png"))).toBe("exact payload")
        bytes[30 + new TextEncoder().encode("frame_\u00e9.png").length] ^= 1
        expect(() => parseStoredZip(bytes)).toThrow("ZIP CRC")
    })

    it("rejects ZIP32 overflow before materializing a payload", async () => {
        const writer = new ZipArchive()
        const blob = new Blob(["small"])
        Object.defineProperty(blob, "size", { value: 0x100000000 })
        const read = vi.spyOn(blob, "arrayBuffer")
        await expect(writer.append("frame.png", blob)).rejects.toThrow("size limit")
        expect(read).not.toHaveBeenCalled()
    })

    it.each(["missing", "extra", "metadata", "read", "writer", "changed", "unsafe", "terminal"])("fails safely on %s", async kind => {
        const f = fixture()
        const original = JSON.stringify(f.context.terminal)
        const writer = new ZipArchive()
        if (kind === "missing") f.rows.pop()
        if (kind === "extra") f.rows.push({ ...f.rows[0], orderIndex: 99 })
        if (kind === "metadata") f.rows[0].width = 2
        if (kind === "read") vi.mocked(f.reader.read).mockRejectedValue(new Error("private read error"))
        if (kind === "writer") vi.spyOn(writer, "append").mockRejectedValue(new Error("writer failure"))
        if (kind === "changed") vi.mocked(f.reader.keys).mockResolvedValueOnce(f.rows.map(row => ["run", row.orderIndex])).mockResolvedValue([])
        if (kind === "unsafe") f.context = { ...f.context, terminal: { ...f.context.terminal, outcomes: [{ ...f.context.terminal.outcomes[0], outputName: "../evil.png" }, ...f.context.terminal.outcomes.slice(1)] },
            manifest: { ...f.context.manifest, processable: [{ ...f.context.manifest.processable[0], outputName: "../evil.png" }, ...f.context.manifest.processable.slice(1)] } }
        if (kind === "terminal") f.context = { ...f.context, terminal: { ...f.context.terminal, progress: { ...f.context.terminal.progress, succeeded: 99 } } }
        const before = JSON.stringify(f.context.terminal)
        await expect(packageBatch(f.context, () => {}, f.open, writer)).rejects.toThrow()
        expect(JSON.stringify(f.context.terminal)).toBe(before)
        expect(original).toContain('"status":"completed"')
    })

    it("retries without rerunning, rejects concurrent start and retains no previous ZIP", async () => {
        const f = fixture()
        let release!: () => void
        const wait = new Promise<void>(resolve => { release = resolve })
        const build = vi.fn<typeof packageBatch>().mockRejectedValueOnce(new Error("temporary"))
            .mockImplementation(async (context, notify) => { await wait; return packageBatch(context, notify, f.open) })
        const download = vi.fn()
        const cleanup = vi.fn(async () => {})
        const controller = new PackagingController(build, download, cleanup)
        expect(await controller.start(f.context)).toBe(false)
        expect(controller.getSnapshot().status).toBe("packaging-error")
        const retry = controller.start(f.context)
        expect(await controller.start(f.context)).toBe(false)
        release()
        expect(await retry).toBe(true)
        expect(controller.getSnapshot().status).toBe("ready")
        expect(download).not.toHaveBeenCalled()
        expect(await controller.downloadPrepared()).toBe("saved")
        expect(controller.getSnapshot().status).toBe("download-triggered")
        expect(await controller.start(f.context)).toBe(false)
        expect(await controller.downloadPrepared()).toBe("saved")
        expect(download).toHaveBeenCalledTimes(2)
        expect(build).toHaveBeenCalledTimes(2)
        expect(cleanup).toHaveBeenCalledTimes(1)
        expect(f.rows).toHaveLength(5)
    })

    it("download creation failure leaves terminal truth intact and permits retry", async () => {
        const f = fixture(8, 3, "cancelled")
        const download = vi.fn().mockImplementationOnce(() => { throw new Error("URL unavailable") })
        const build = vi.fn<typeof packageBatch>().mockImplementation((context, notify) => packageBatch(context, notify, f.open))
        const controller = new PackagingController(build, download, vi.fn(async () => {}))
        const before = JSON.stringify(f.context)
        expect(await controller.start(f.context)).toBe(true)
        expect(await controller.downloadPrepared()).toBe("failed")
        expect(controller.getSnapshot().status).toBe("ready")
        expect(await controller.downloadPrepared()).toBe("saved")
        expect(build).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(f.context)).toBe(before)
    })

    it("dismissed desktop ZIP picker retains the prepared archive for another save", async () => {
        const f = fixture()
        const fallback = vi.fn()
        const write = vi.fn(async (blob: Blob) => { expect(blob.size).toBeGreaterThan(0) })
        const picker = vi.fn().mockRejectedValueOnce(new DOMException("dismissed", "AbortError"))
            .mockResolvedValueOnce({ createWritable: async () => ({ write, close: async () => {}, abort: async () => {} }) })
        vi.stubGlobal("window", { showSaveFilePicker: picker })
        vi.stubGlobal("navigator", { userAgent: "Desktop Chrome" })
        try {
            const controller = new PackagingController(
                (context, notify) => packageBatch(context, notify, f.open), fallback, vi.fn(async () => {}))
            expect(await controller.start(f.context)).toBe(true)
            expect(await controller.downloadPrepared()).toBe("cancelled")
            expect(controller.getSnapshot().status).toBe("ready")
            expect(fallback).not.toHaveBeenCalled()
            expect(await controller.downloadPrepared()).toBe("saved")
            expect(controller.getSnapshot().status).toBe("download-triggered")
            expect(write).toHaveBeenCalledOnce()
        } finally { vi.unstubAllGlobals() }
    })

    it("keeps a started download URL alive and revokes one when anchor creation fails", () => {
        const revoke = vi.fn()
        const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() }
        vi.stubGlobal("URL", { createObjectURL: () => "blob:test", revokeObjectURL: revoke })
        const create = vi.fn().mockReturnValueOnce(anchor).mockImplementationOnce(() => { throw new Error("No anchor") })
        vi.stubGlobal("document", { createElement: create, body: { append: vi.fn() } })
        try {
            downloadArchive(new Blob(["zip"]), "archive.zip")
            expect(anchor.click).toHaveBeenCalledOnce()
            expect(anchor.remove).toHaveBeenCalledOnce()
            expect(revoke).not.toHaveBeenCalled()
            expect(() => downloadArchive(new Blob(["zip"]), "archive.zip")).toThrow("No anchor")
            expect(revoke).toHaveBeenCalledOnce()
        } finally { vi.unstubAllGlobals() }
    })

    it("materializes one PNG payload at a time for 1000 entries", async () => {
        const f = fixture(1000)
        let active = 0
        let peak = 0
        let reads = 0
        const native = Blob.prototype.arrayBuffer
        vi.spyOn(Blob.prototype, "arrayBuffer").mockImplementation(async function(this: Blob) {
            if (this.type !== "image/png") return native.call(this)
            active++; peak = Math.max(peak, active); reads++
            try { return await native.call(this) } finally { active-- }
        })
        try {
            const zip = await packageBatch(f.context, () => {}, f.open)
            expect(reads).toBe(1000)
            expect(peak).toBe(1)
            expect(active).toBe(0)
            expect(parseStoredZip(new Uint8Array(await native.call(zip))).size).toBe(1001)
        } finally { vi.restoreAllMocks() }
    })
})
