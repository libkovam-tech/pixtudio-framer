import { decodeAndValidateRasterImageFile } from "../../src/editor/fileIntakeSecurity.ts"
import { renderFinalFrame } from "../../src/plugins/batchPixelation/render/finalFrame.ts"
import type { SealedReference } from "../../src/plugins/batchPixelation/authoring/BatchReferenceEnvelope.ts"
import { BatchOutputSinkFatalError, runBatchFrames, type BatchFrameOutput, type BatchFrameOutputSink } from
    "../../src/plugins/batchPixelation/runner/runBatchFrames.ts"
import { scanSourceSet } from "../../src/plugins/batchPixelation/sourceSet/scanSourceSet.ts"
import type { SourceDirectoryHandle } from "../../src/plugins/batchPixelation/sourceSet/sourceDirectory.ts"

export type ControlledSource = Readonly<{ name: string; type: string; bytes: number[] }>
export type ControlledMutation = Readonly<{
    name: string
    kind: "replace" | "unreadable" | "rename" | "missing-handle"
    bytes?: number[]
    type?: string
    newName?: string
}>
export type ControlledOptions = Readonly<{
    verifyIdentity?: boolean
    failSinkFor?: string
    fatalSinkFor?: string
}>

type LiveSource = {
    name: string
    type: string
    bytes: number[]
    unreadable: boolean
    returnedName: string
    reads: number
}

function rgbaFromCanvas(canvas: HTMLCanvasElement): Uint8ClampedArray {
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Missing 2D context")
    return context.getImageData(0, 0, canvas.width, canvas.height).data
}

async function directRgba(source: LiveSource, recipe: SealedReference["recipe"]) {
    const file = new File([Uint8Array.from(source.bytes)], source.name, { type: source.type })
    const bitmap = await decodeAndValidateRasterImageFile(file)
    let canvas: HTMLCanvasElement | null = null
    try {
        canvas = renderFinalFrame(bitmap, recipe)
        return { width: canvas.width, height: canvas.height, rgba: Uint8ClampedArray.from(rgbaFromCanvas(canvas)) }
    } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0 }
        bitmap.close()
    }
}

async function inspectPng(frame: BatchFrameOutput, expected?: Awaited<ReturnType<typeof directRgba>>) {
    const bytes = await frame.png.arrayBuffer()
    const digest = await crypto.subtle.digest("SHA-256", bytes)
    const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")
    const bitmap = await createImageBitmap(frame.png)
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    try {
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Missing PNG decode context")
        context.drawImage(bitmap, 0, 0)
        const actual = rgbaFromCanvas(canvas)
        let differentBytes: number | null = null
        if (expected) {
            differentBytes = actual.length === expected.rgba.length ? 0 :
                Math.max(actual.length, expected.rgba.length)
            if (actual.length === expected.rgba.length) {
                for (let index = 0; index < actual.length; index++) {
                    if (actual[index] !== expected.rgba[index]) differentBytes++
                }
            }
        }
        return { outputName: frame.outputName, sourceFilename: frame.sourceFilename,
            width: bitmap.width, height: bitmap.height, rgbaLength: actual.length,
            directWidth: expected?.width ?? null, directHeight: expected?.height ?? null,
            directRgbaLength: expected?.rgba.length ?? null, differentBytes,
            pngBytes: bytes.byteLength, sha256 }
    } finally {
        canvas.width = 0
        canvas.height = 0
        bitmap.close()
    }
}

export async function runControlledBatch(sealed: SealedReference, sources: ControlledSource[],
    mutations: ControlledMutation[] = [], options: ControlledOptions = {}) {
    const live = new Map<string, LiveSource>(sources.map(source => [source.name, {
        ...source, returnedName: source.name, unreadable: false, reads: 0,
    }]))
    const directory: SourceDirectoryHandle = { kind: "directory", name: "GATE8_CONTROLLED", async *values() {
        for (const source of sources) {
            const state = live.get(source.name)!
            yield { kind: "file", name: source.name, async getFile() {
                state.reads++
                if (state.unreadable) throw new DOMException("Source unavailable", "NotReadableError")
                return new File([Uint8Array.from(state.bytes)], state.returnedName, { type: state.type })
            } }
        }
    } }
    const scan = await scanSourceSet(directory, sealed.referenceInputGeometry)
    const readsAfterScan = new Map([...live].map(([name, state]) => [name, state.reads]))
    let runtime = scan.runtime
    for (const mutation of mutations) {
        const source = live.get(mutation.name)
        if (!source) throw new Error(`Unknown controlled source: ${mutation.name}`)
        if (mutation.kind === "replace") {
            if (!mutation.bytes || !mutation.type) throw new Error("Replacement requires bytes and type")
            source.bytes = mutation.bytes
            source.type = mutation.type
        } else if (mutation.kind === "unreadable") {
            source.unreadable = true
        } else if (mutation.kind === "rename") {
            source.returnedName = mutation.newName ?? "renamed.png"
        } else {
            runtime = { orderedFileHandles: runtime.orderedFileHandles.filter(row => row.filename !== mutation.name) }
        }
    }
    const expected = new Map<string, Awaited<ReturnType<typeof directRgba>>>()
    if (options.verifyIdentity && scan.manifest.overallStatus === "ready") {
        for (const entry of scan.manifest.processable) {
            const source = live.get(entry.filename)!
            if (!source.unreadable && source.returnedName === source.name &&
                !mutations.some(mutation => mutation.name === source.name && mutation.kind === "missing-handle")) {
                try { expected.set(entry.filename, await directRgba(source, sealed.recipe)) } catch { /* runtime skip */ }
            }
        }
    }
    const writes: Awaited<ReturnType<typeof inspectPng>>[] = []
    let sinkInFlight = 0
    let peakSinkInFlight = 0
    const sink: BatchFrameOutputSink = { async writeFrame(frame) {
        sinkInFlight++
        peakSinkInFlight = Math.max(peakSinkInFlight, sinkInFlight)
        try {
            if (options.fatalSinkFor === frame.sourceFilename) {
                throw new BatchOutputSinkFatalError("Controlled fatal sink failure")
            }
            if (options.failSinkFor === frame.sourceFilename) throw new Error("Controlled frame sink failure")
            writes.push(await inspectPng(frame, expected.get(frame.sourceFilename)))
        } finally {
            sinkInFlight--
        }
    } }
    const recipeBefore = JSON.stringify(sealed.recipe)
    const result = await runBatchFrames(sealed, scan.manifest, runtime, sink)
    return { manifest: scan.manifest, result, writes, peakSinkInFlight,
        readsDuringRun: Object.fromEntries([...live].map(([name, state]) =>
            [name, state.reads - (readsAfterScan.get(name) ?? 0)])),
        recipeUnchanged: recipeBefore === JSON.stringify(sealed.recipe), sinkRetainedBytesAfterWrite: 0 }
}

export async function probeInvalidRunPlan(sealed: SealedReference, source: ControlledSource,
    kind: "geometry" | "association" | "recipe") {
    const directory: SourceDirectoryHandle = { kind: "directory", name: "INVALID_PLAN", async *values() {
        yield { kind: "file", name: source.name, async getFile() {
            return new File([Uint8Array.from(source.bytes)], source.name, { type: source.type })
        } }
    } }
    const scan = await scanSourceSet(directory, sealed.referenceInputGeometry)
    const manifest = kind === "geometry" ? { ...scan.manifest,
        sourceGeometry: { width: sealed.referenceInputGeometry.width + 1,
            height: sealed.referenceInputGeometry.height } } : scan.manifest
    const runtime = kind === "association" ? { orderedFileHandles: [
        ...scan.runtime.orderedFileHandles, scan.runtime.orderedFileHandles[0],
    ] } : scan.runtime
    const candidate = kind === "recipe" ? { ...sealed,
        recipe: { ...sealed.recipe, version: 2 } as unknown as SealedReference["recipe"] } : sealed
    let sinkCalls = 0
    try {
        await runBatchFrames(candidate, manifest, runtime, { async writeFrame() { sinkCalls++ } })
        return { rejected: false, message: null, sinkCalls }
    } catch (error) {
        return { rejected: true, message: error instanceof Error ? error.message : String(error), sinkCalls }
    }
}
