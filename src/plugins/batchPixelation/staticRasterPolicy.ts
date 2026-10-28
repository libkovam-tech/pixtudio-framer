import {
    assertDecodedImageDimensions,
    assertRasterImageFileCandidate,
    decodeAndValidateRasterImageFile,
    FileIntakeError,
    FILE_INTAKE_MESSAGES,
} from "../../editor/fileIntakeSecurity.ts"

export type StaticRasterInspection =
    | { kind: "static"; format: "gif" | "png" | "jpeg" }
    | { kind: "animated"; format: "gif" | "png" }
    | { kind: "invalid" | "unsupported" }

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function gifInspection(bytes: Uint8Array): StaticRasterInspection {
    if (bytes.length < 14) return { kind: "invalid" }
    const width = bytes[6] | (bytes[7] << 8)
    const height = bytes[8] | (bytes[9] << 8)
    if (!width || !height) return { kind: "invalid" }
    let offset = 13
    if (bytes[10] & 0x80) offset += 3 * (1 << ((bytes[10] & 7) + 1))
    if (offset > bytes.length) return { kind: "invalid" }
    let frames = 0
    const skipSubBlocks = () => {
        while (offset < bytes.length) {
            const size = bytes[offset++]
            if (size === 0) return true
            offset += size
            if (offset > bytes.length) return false
        }
        return false
    }
    while (offset < bytes.length) {
        const marker = bytes[offset++]
        if (marker === 0x3b) {
            if (offset !== bytes.length || !frames) return { kind: "invalid" }
            return frames === 1 ? { kind: "static", format: "gif" } : { kind: "animated", format: "gif" }
        }
        if (marker === 0x21) {
            if (offset >= bytes.length) return { kind: "invalid" }
            const label = bytes[offset++]
            // Plain-text extensions are graphic rendering blocks, not a static image frame.
            if (label === 0x01) return { kind: "unsupported" }
            if (!skipSubBlocks()) return { kind: "invalid" }
            continue
        }
        if (marker !== 0x2c || offset + 9 > bytes.length) return { kind: "invalid" }
        const imageWidth = bytes[offset + 4] | (bytes[offset + 5] << 8)
        const imageHeight = bytes[offset + 6] | (bytes[offset + 7] << 8)
        if (!imageWidth || !imageHeight) return { kind: "invalid" }
        const flags = bytes[offset + 8]
        offset += 9
        if (flags & 0x80) offset += 3 * (1 << ((flags & 7) + 1))
        if (offset >= bytes.length) return { kind: "invalid" }
        const minCodeSize = bytes[offset++]
        if (minCodeSize < 2 || minCodeSize > 8 || !skipSubBlocks()) return { kind: "invalid" }
        frames++
    }
    return { kind: "invalid" }
}

function pngInspection(bytes: Uint8Array): StaticRasterInspection {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let offset = PNG_SIGNATURE.length
    let sawHeader = false
    let sawImage = false
    let animated = false
    while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset)
        if (length > bytes.length - offset - 12) return { kind: "invalid" }
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
        if (!sawHeader && (type !== "IHDR" || length !== 13)) return { kind: "invalid" }
        if (type === "IHDR") {
            if (sawHeader || !view.getUint32(offset + 8) || !view.getUint32(offset + 12)) return { kind: "invalid" }
            sawHeader = true
        }
        if (type === "IDAT") sawImage = true
        if (type === "acTL") animated = true
        offset += length + 12
        if (type === "IEND") {
            if (length !== 0 || !sawImage || offset !== bytes.length) return { kind: "invalid" }
            return animated ? { kind: "animated", format: "png" } : { kind: "static", format: "png" }
        }
    }
    return { kind: "invalid" }
}

export function inspectStaticRaster(bytes: Uint8Array): StaticRasterInspection {
    if (bytes.length >= 6) {
        const header = String.fromCharCode(...bytes.subarray(0, 6))
        if (header === "GIF87a" || header === "GIF89a") return gifInspection(bytes)
    }
    if (bytes.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((value, i) => bytes[i] === value)) {
        return pngInspection(bytes)
    }
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return { kind: "static", format: "jpeg" }
    }
    return { kind: "unsupported" }
}

export class BatchRasterPreflightError extends Error {
    readonly code: "animated-gif" | "animated-png" | "invalid" | "unsupported"

    constructor(code: "animated-gif" | "animated-png" | "invalid" | "unsupported") {
        super(code === "animated-gif" ? "Animated GIF is not supported by Batch." :
            code === "animated-png" ? "Animated PNG is not supported by Batch." :
                code === "invalid" ? "The image container is invalid." : "This image format is not supported by Batch.")
        this.name = "BatchRasterPreflightError"
        this.code = code
    }
}

async function readStaticBatchRasterFile(file: File) {
    try {
        assertRasterImageFileCandidate(file)
    } catch (error) {
        if (error instanceof FileIntakeError && error.code === "unsupported-file") {
            throw new BatchRasterPreflightError("unsupported")
        }
        throw error
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const inspection = inspectStaticRaster(bytes)
    if (inspection.kind === "animated") {
        throw new BatchRasterPreflightError(inspection.format === "gif" ? "animated-gif" : "animated-png")
    }
    if (inspection.kind !== "static") throw new BatchRasterPreflightError(inspection.kind)
    return { inspection, bytes }
}

export async function assertStaticBatchRasterFile(
    file: File
): Promise<Extract<StaticRasterInspection, { kind: "static" }>> {
    return (await readStaticBatchRasterFile(file)).inspection
}

export async function prepareStaticBatchReferenceFile(file: File): Promise<File> {
    const { inspection, bytes } = await readStaticBatchRasterFile(file)
    const type = `image/${inspection.format}`
    const stableFile = new File([bytes], file.name, { type, lastModified: file.lastModified })
    if (inspection.format !== "gif") return stableFile

    const url = URL.createObjectURL(stableFile)
    try {
        const image = new Image()
        image.src = url
        await image.decode()
        assertDecodedImageDimensions({ width: image.naturalWidth, height: image.naturalHeight })
        const canvas = document.createElement("canvas")
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext("2d")
        if (!context) throw new Error("Canvas unavailable")
        context.drawImage(image, 0, 0)
        const png = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"))
        if (!png) throw new Error("PNG encoding failed")
        const name = /\.gif$/i.test(file.name) ? file.name.replace(/\.gif$/i, ".png") : `${file.name}.png`
        return new File([png], name, { type: "image/png", lastModified: file.lastModified })
    } catch (error) {
        if (error instanceof FileIntakeError) throw error
        throw new FileIntakeError("image-decode-failed", FILE_INTAKE_MESSAGES.imageDecodeFailed)
    } finally {
        URL.revokeObjectURL(url)
    }
}

export async function decodeStaticBatchRaster(file: File): Promise<ImageBitmap> {
    await assertStaticBatchRasterFile(file)
    return decodeAndValidateRasterImageFile(file)
}
