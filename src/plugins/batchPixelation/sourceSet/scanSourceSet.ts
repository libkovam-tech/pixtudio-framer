import { decodeAndValidateRasterImageFile, FileIntakeError } from "../../../editor/fileIntakeSecurity.ts"
import { assertStaticBatchRasterFile, BatchRasterPreflightError } from "../staticRasterPolicy.ts"
import { compareNaturalFilename } from "./naturalFilenameOrder.ts"
import type { SourceDirectoryHandle, SourceFileHandle } from "./sourceDirectory.ts"

export type SourceGeometry = Readonly<{ width: number; height: number }>
export type SourceFormat = "jpeg" | "png" | "gif"
export type SourceSkipReason =
    | "unsupported-format"
    | "animated-gif"
    | "animated-png"
    | "invalid-or-corrupt"
    | "encoded-file-too-large"
    | "decoded-image-too-large"
    | "geometry-mismatch"
    | "output-name-collision"
    | "reference-geometry-incompatible"

export type SourceCandidateRecord = Readonly<{
    orderIndex: number
    filename: string
    detectedFormat: SourceFormat | null
    decodedGeometry: SourceGeometry | null
    plannedOutputName: string | null
    status: "eligible" | "skipped"
    skipReason: SourceSkipReason | null
}>

export type SourceSetManifest = Readonly<{
    version: 1
    folderDisplayName: string
    referenceInputGeometry: SourceGeometry
    sourceGeometry: SourceGeometry | null
    overallStatus: "ready" | "blocked-reference-geometry" | "no-valid-source-frames"
    orderedCandidates: readonly SourceCandidateRecord[]
    processable: readonly Readonly<{ orderIndex: number; filename: string; outputName: string }>[]
    skipped: readonly Readonly<{ orderIndex: number; filename: string; reason: SourceSkipReason }>[]
    collisions: readonly Readonly<{
        outputName: string
        winnerIndex: number
        winnerFilename: string
        skippedIndex: number
        skippedFilename: string
    }>[]
    counts: Readonly<{ candidates: number; processable: number; skipped: number; collisions: number }>
}>

export type SourceSetRuntime = Readonly<{
    orderedFileHandles: readonly Readonly<{
        orderIndex: number
        filename: string
        handle: SourceFileHandle
    }>[]
}>

export type SourceSetScan = Readonly<{ manifest: SourceSetManifest; runtime: SourceSetRuntime }>

function throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new DOMException("Source Set scan replaced", "AbortError")
}

function sameGeometry(a: SourceGeometry, b: SourceGeometry): boolean {
    return a.width === b.width && a.height === b.height
}

function outputName(filename: string): string {
    const dot = filename.lastIndexOf(".")
    return `${dot > 0 ? filename.slice(0, dot) : filename}.png`
}

function fileUnavailable(error: unknown): boolean {
    return error instanceof Error && ["NotFoundError", "NotReadableError", "NotAllowedError"].includes(error.name)
}

const SOURCE_ACCESS_LOST = "Source folder or files became unavailable during scan. Choose the folder again."

function preflightSkipReason(error: unknown): SourceSkipReason | null {
    if (error instanceof BatchRasterPreflightError) {
        if (error.code === "animated-gif" || error.code === "animated-png") return error.code
        return error.code === "unsupported" ? "unsupported-format" : "invalid-or-corrupt"
    }
    if (error instanceof FileIntakeError) {
        if (error.code === "unsupported-file") return "unsupported-format"
        if (error.code === "image-too-large") return "encoded-file-too-large"
    }
    return null
}

function decodedSkipReason(error: unknown): SourceSkipReason | null {
    if (!(error instanceof FileIntakeError)) return null
    if (error.code === "image-too-large") return "decoded-image-too-large"
    if (error.code === "image-decode-failed") return "invalid-or-corrupt"
    return null
}

export async function scanSourceSet(
    directory: SourceDirectoryHandle,
    referenceInputGeometry: SourceGeometry,
    signal?: AbortSignal,
): Promise<SourceSetScan> {
    if (!Number.isSafeInteger(referenceInputGeometry.width) || referenceInputGeometry.width <= 0 ||
        !Number.isSafeInteger(referenceInputGeometry.height) || referenceInputGeometry.height <= 0) {
        throw new Error("Invalid sealed Reference Input Geometry")
    }
    if (typeof createImageBitmap !== "function") throw new Error("The canonical image decoder is unavailable.")

    const handles: SourceFileHandle[] = []
    try {
        for await (const entry of directory.values()) {
            throwIfAborted(signal)
            if (entry.kind === "file") handles.push(entry)
        }
    } catch (error) {
        throwIfAborted(signal)
        if (!fileUnavailable(error)) throw error
        throw new Error(SOURCE_ACCESS_LOST, { cause: error })
    }
    handles.sort((a, b) => compareNaturalFilename(a.name, b.name))
    for (let index = 1; index < handles.length; index++) {
        if (handles[index - 1].name === handles[index].name) {
            throw new Error(`Duplicate filename in Source Folder: ${handles[index].name}`)
        }
    }

    const orderedFileHandles = handles.map((handle, orderIndex) => ({
        orderIndex, filename: handle.name, handle,
    }))
    const candidates: SourceCandidateRecord[] = []
    let sourceGeometry: SourceGeometry | null = null

    for (const { handle, orderIndex, filename } of orderedFileHandles) {
        throwIfAborted(signal)
        let detectedFormat: SourceFormat | null = null
        let decodedGeometry: SourceGeometry | null = null
        const plannedOutputName = null
        let skipReason: SourceSkipReason | null = null
        let file: File
        try {
            file = await handle.getFile()
            throwIfAborted(signal)
        } catch (error) {
            throwIfAborted(signal)
            if (!fileUnavailable(error)) throw error
            throw new Error(SOURCE_ACCESS_LOST, { cause: error })
        }
        if (file.name !== filename) throw new Error("Source file handle name changed during scan")

        try {
            detectedFormat = (await assertStaticBatchRasterFile(file)).format
            throwIfAborted(signal)
        } catch (error) {
            throwIfAborted(signal)
            if (fileUnavailable(error)) throw new Error(SOURCE_ACCESS_LOST, { cause: error })
            skipReason = preflightSkipReason(error)
            if (!skipReason) throw error
            if (skipReason === "animated-gif") detectedFormat = "gif"
            if (skipReason === "animated-png") detectedFormat = "png"
            candidates.push({ orderIndex, filename, detectedFormat, decodedGeometry, plannedOutputName,
                status: "skipped", skipReason })
            continue
        }

        let bitmap: ImageBitmap
        try {
            bitmap = await decodeAndValidateRasterImageFile(file)
        } catch (error) {
            throwIfAborted(signal)
            const reason = decodedSkipReason(error)
            if (!reason) throw error
            candidates.push({ orderIndex, filename, detectedFormat, decodedGeometry, plannedOutputName,
                status: "skipped", skipReason: reason })
            continue
        }

        try {
            throwIfAborted(signal)
            decodedGeometry = { width: bitmap.width, height: bitmap.height }
            if (!sourceGeometry) sourceGeometry = decodedGeometry
            if (!sameGeometry(decodedGeometry, sourceGeometry)) {
                skipReason = "geometry-mismatch"
            }
            candidates.push({ orderIndex, filename, detectedFormat, decodedGeometry, plannedOutputName,
                status: skipReason ? "skipped" : "eligible", skipReason })
        } finally {
            bitmap.close()
        }
    }

    const overallStatus = !sourceGeometry ? "no-valid-source-frames" :
        sameGeometry(sourceGeometry, referenceInputGeometry) ? "ready" : "blocked-reference-geometry"
    const collisions: SourceSetManifest["collisions"][number][] = []
    const outputOwners = new Map<string, { orderIndex: number; filename: string }>()
    const finalCandidates: SourceCandidateRecord[] = overallStatus === "blocked-reference-geometry"
        ? candidates.map(candidate => candidate.status === "eligible"
            ? { ...candidate, status: "skipped" as const,
                skipReason: "reference-geometry-incompatible" as const }
            : candidate)
        : overallStatus === "ready"
            ? candidates.map(candidate => {
                if (candidate.status === "skipped") return candidate
                const plannedOutputName = outputName(candidate.filename)
                const winner = outputOwners.get(plannedOutputName)
                if (winner) {
                    collisions.push({ outputName: plannedOutputName, winnerIndex: winner.orderIndex,
                        winnerFilename: winner.filename, skippedIndex: candidate.orderIndex,
                        skippedFilename: candidate.filename })
                    return { ...candidate, plannedOutputName,
                        status: "skipped" as const, skipReason: "output-name-collision" as const }
                }
                outputOwners.set(plannedOutputName, {
                    orderIndex: candidate.orderIndex, filename: candidate.filename,
                })
                return { ...candidate, plannedOutputName }
            })
            : candidates
    const processable = finalCandidates.flatMap(candidate =>
        candidate.status === "eligible" && candidate.plannedOutputName
            ? [{ orderIndex: candidate.orderIndex, filename: candidate.filename,
                outputName: candidate.plannedOutputName }]
            : [])
    const skipped = finalCandidates.flatMap(candidate =>
        candidate.status === "skipped" && candidate.skipReason
            ? [{ orderIndex: candidate.orderIndex, filename: candidate.filename, reason: candidate.skipReason }]
            : [])
    const manifest: SourceSetManifest = {
        version: 1,
        folderDisplayName: directory.name,
        referenceInputGeometry: { ...referenceInputGeometry },
        sourceGeometry,
        overallStatus,
        orderedCandidates: finalCandidates,
        processable,
        skipped,
        collisions,
        counts: { candidates: finalCandidates.length, processable: processable.length,
            skipped: skipped.length, collisions: collisions.length },
    }
    return { manifest, runtime: { orderedFileHandles } }
}
