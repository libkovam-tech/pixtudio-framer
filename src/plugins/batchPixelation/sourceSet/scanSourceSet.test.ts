import { afterEach, describe, expect, it, vi } from "vitest"
import { animatedGifBytes, staticGifBytes } from "../../../../tests/fixtures/staticGifBytes"
import { controlledPng } from "../../../../tests/fixtures/staticRasterBytes"
import { FILE_INTAKE_LIMITS, FileIntakeError } from "../../../editor/fileIntakeSecurity"
import type { SourceDirectoryHandle, SourceFileHandle } from "./sourceDirectory"
import { scanSourceSet } from "./scanSourceSet"

function file(name: string, bytes: Uint8Array, type: string): SourceFileHandle {
    return { kind: "file", name, async getFile() {
        return new File([Uint8Array.from(bytes)], name, { type })
    } }
}

function folder(...entries: SourceFileHandle[]): SourceDirectoryHandle {
    return { kind: "directory", name: "SOURCE", async *values() {
        for (const entry of entries) yield entry
        yield { kind: "directory" as const, name: "nested" }
    } }
}

const gif = (name: string) => file(name, staticGifBytes, "image/gif")
const png = (name: string) => file(name, controlledPng(false), "image/png")
const jpeg = (name: string) => file(name, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg")

afterEach(() => vi.unstubAllGlobals())

describe("Batch Source Set scan", () => {
    it("sorts before classification, establishes first valid geometry and closes every bitmap", async () => {
        const close = vi.fn()
        const decode = vi.fn(async (source: File) => ({
            width: source.name === "03_reference.png" ? 1 : 2,
            height: source.name === "03_reference.png" ? 1 : 2, close,
        }))
        vi.stubGlobal("createImageBitmap", decode)
        const scan = await scanSourceSet(folder(
            png("03_reference.png"), png("02_first.png"),
            file("01_animated.gif", animatedGifBytes, "image/gif"),
            gif("same.gif"), jpeg("same.jpg"),
        ), { width: 1, height: 1 })
        expect(scan.manifest.orderedCandidates.map(candidate => candidate.filename))
            .toEqual(["01_animated.gif", "02_first.png", "03_reference.png", "same.gif", "same.jpg"])
        expect(scan.manifest.orderedCandidates.map(candidate => candidate.skipReason))
            .toEqual(["animated-gif", "reference-geometry-incompatible", "geometry-mismatch",
                "reference-geometry-incompatible", "reference-geometry-incompatible"])
        expect(scan.manifest.sourceGeometry).toEqual({ width: 2, height: 2 })
        expect(scan.manifest.overallStatus).toBe("blocked-reference-geometry")
        expect(scan.manifest.processable).toEqual([])
        expect(scan.manifest.collisions).toEqual([])
        expect(scan.manifest.orderedCandidates.every(candidate => candidate.plannedOutputName === null)).toBe(true)
        expect(decode).toHaveBeenCalledTimes(4)
        expect(close).toHaveBeenCalledTimes(4)
        expect(JSON.stringify(scan.manifest)).not.toContain("getFile")
        expect(scan.runtime.orderedFileHandles).toHaveLength(5)
    })

    it("resolves exact output collisions only after eligibility", async () => {
        const close = vi.fn()
        vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close })))
        const scan = await scanSourceSet(folder(
            png("badname.png"), jpeg("same.jpg"),
            file("badname.gif", animatedGifBytes, "image/gif"), gif("same.gif"),
        ), { width: 1, height: 1 })
        expect(scan.manifest.orderedCandidates.map(candidate => candidate.filename))
            .toEqual(["badname.gif", "badname.png", "same.gif", "same.jpg"])
        expect(scan.manifest.processable.map(entry => [entry.filename, entry.outputName]))
            .toEqual([["badname.png", "badname.png"], ["same.gif", "same.png"]])
        expect(scan.manifest.skipped.map(entry => [entry.filename, entry.reason]))
            .toEqual([["badname.gif", "animated-gif"], ["same.jpg", "output-name-collision"]])
        expect(scan.manifest.collisions).toEqual([{
            outputName: "same.png", winnerIndex: 2, winnerFilename: "same.gif",
            skippedIndex: 3, skippedFilename: "same.jpg",
        }])
        expect(close).toHaveBeenCalledTimes(3)
    })

    it("does not reserve an output name for a geometry-mismatched candidate", async () => {
        const close = vi.fn()
        vi.stubGlobal("createImageBitmap", vi.fn(async (source: File) => ({
            width: source.name === "same.gif" ? 2 : 1,
            height: source.name === "same.gif" ? 2 : 1,
            close,
        })))
        const scan = await scanSourceSet(folder(gif("same.gif"), jpeg("same.jpg"), gif("first.gif")),
            { width: 1, height: 1 })
        expect(scan.manifest.orderedCandidates.map(candidate => candidate.filename))
            .toEqual(["first.gif", "same.gif", "same.jpg"])
        expect(scan.manifest.skipped.map(entry => [entry.filename, entry.reason]))
            .toEqual([["same.gif", "geometry-mismatch"]])
        expect(scan.manifest.processable.map(entry => [entry.filename, entry.outputName]))
            .toEqual([["first.gif", "first.png"], ["same.jpg", "same.png"]])
        expect(scan.manifest.collisions).toEqual([])
        expect(close).toHaveBeenCalledTimes(3)
    })

    it("produces no-valid-source-frames without invoking the decoder", async () => {
        const decode = vi.fn()
        vi.stubGlobal("createImageBitmap", decode)
        const scan = await scanSourceSet(folder(
            file("animated.gif", animatedGifBytes, "image/gif"),
            file("animated.png", controlledPng(true), "image/png"),
            file("unsupported.webp", Uint8Array.from([82, 73, 70, 70]), "image/webp"),
        ), { width: 1, height: 1 })
        expect(scan.manifest.sourceGeometry).toBeNull()
        expect(scan.manifest.overallStatus).toBe("no-valid-source-frames")
        expect(scan.manifest.processable).toEqual([])
        expect(scan.manifest.counts).toEqual({ candidates: 3, processable: 0, skipped: 3, collisions: 0 })
        expect(decode).not.toHaveBeenCalled()
    })

    it("releases the decoded bitmap when a scan is replaced", async () => {
        const close = vi.fn()
        const controller = new AbortController()
        vi.stubGlobal("createImageBitmap", vi.fn(async () => {
            controller.abort()
            return { width: 1, height: 1, close }
        }))
        await expect(scanSourceSet(folder(gif("frame1.gif")), { width: 1, height: 1 }, controller.signal))
            .rejects.toMatchObject({ name: "AbortError" })
        expect(close).toHaveBeenCalledOnce()
    })

    it("keeps invalid images file-local but fails the scan when a selected file becomes unavailable", async () => {
        const oversized: SourceFileHandle = { kind: "file", name: "big.png", async getFile() {
            const source = new File([Uint8Array.from(controlledPng(false))], "big.png", { type: "image/png" })
            Object.defineProperty(source, "size", { value: FILE_INTAKE_LIMITS.MAX_IMAGE_BYTES + 1 })
            return source
        } }
        const unreadable: SourceFileHandle = { kind: "file", name: "missing.png", async getFile() {
            throw new DOMException("File removed", "NotFoundError")
        } }
        const close = vi.fn()
        const decode = vi.fn(async (source: File) => {
            if (source.name === "corrupt.jpg") {
                throw new FileIntakeError("image-decode-failed", "The image could not be decoded.")
            }
            return { width: 1, height: 1, close }
        })
        vi.stubGlobal("createImageBitmap", decode)
        const scan = await scanSourceSet(folder(oversized, jpeg("corrupt.jpg"), gif("valid.gif")),
            { width: 1, height: 1 })
        expect(scan.manifest.skipped.map(entry => [entry.filename, entry.reason])).toEqual([
            ["big.png", "encoded-file-too-large"],
            ["corrupt.jpg", "invalid-or-corrupt"],
        ])
        expect(scan.manifest.processable.map(entry => entry.filename)).toEqual(["valid.gif"])
        expect(decode).toHaveBeenCalledTimes(3)
        expect(close).toHaveBeenCalledOnce()
        await expect(scanSourceSet(folder(gif("valid.gif"), unreadable), { width: 1, height: 1 }))
            .rejects.toThrow("Source folder or files became unavailable during scan. Choose the folder again.")
    })

    it("fails the scan when the folder disappears during enumeration", async () => {
        vi.stubGlobal("createImageBitmap", vi.fn())
        const missingFolder: SourceDirectoryHandle = { kind: "directory", name: "SOURCE", async *values() {
            yield gif("valid.gif")
            throw new DOMException("Folder moved", "NotFoundError")
        } }
        await expect(scanSourceSet(missingFolder, { width: 1, height: 1 }))
            .rejects.toThrow("Source folder or files became unavailable during scan. Choose the folder again.")
    })
})
