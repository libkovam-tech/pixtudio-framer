export const FILE_INTAKE_LIMITS = {
    MAX_PROJECT_SAVE_BYTES: 8 * 1024 * 1024,
    MAX_IMAGE_BYTES: 32 * 1024 * 1024,
    MAX_IMAGE_WIDTH: 8192,
    MAX_IMAGE_HEIGHT: 8192,
    MAX_IMAGE_PIXELS: 33_000_000,
} as const

export const FILE_INTAKE_MESSAGES = {
    unsupportedFile: "This file is not supported by PIXTUDIO.",
    damagedProject: "This PIXTUDIO project file appears to be damaged.",
    projectTooLarge: "This PIXTUDIO project file is too large to open safely.",
    imageTooLarge: "This image is too large to open safely.",
    imageDecodeFailed: "The image could not be decoded.",
} as const

export type FileIntakeErrorCode =
    | "unsupported-file"
    | "damaged-project"
    | "project-too-large"
    | "image-too-large"
    | "image-decode-failed"

export class FileIntakeError extends Error {
    readonly code: FileIntakeErrorCode
    readonly userMessage: string

    constructor(code: FileIntakeErrorCode, userMessage: string) {
        super(userMessage)
        this.name = "FileIntakeError"
        this.code = code
        this.userMessage = userMessage
    }
}

export type FileIntakeCandidate = {
    name?: string
    type?: string
    size?: number
}

const PROJECT_EXTENSIONS = new Set(["pixtudio"])
const PROJECT_MIME_TYPES = new Set([
    "application/json",
    "application/pixtudio+json",
])
const RASTER_IMAGE_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "avif",
])
const RASTER_IMAGE_MIME_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/avif",
])

function normalizedExtension(name?: string): string {
    const cleanName = (name ?? "").trim().toLowerCase()
    const dotIndex = cleanName.lastIndexOf(".")
    if (dotIndex < 0 || dotIndex === cleanName.length - 1) return ""
    return cleanName.slice(dotIndex + 1)
}

function normalizedMime(type?: string): string {
    return (type ?? "").trim().toLowerCase()
}

export function isLikelyProjectSaveFile(file: FileIntakeCandidate): boolean {
    const ext = normalizedExtension(file.name)
    const mime = normalizedMime(file.type)
    return PROJECT_EXTENSIONS.has(ext) || PROJECT_MIME_TYPES.has(mime)
}

export function isLikelyRasterImageFile(file: FileIntakeCandidate): boolean {
    const ext = normalizedExtension(file.name)
    const mime = normalizedMime(file.type)
    if (mime) return RASTER_IMAGE_MIME_TYPES.has(mime)
    return RASTER_IMAGE_EXTENSIONS.has(ext)
}

export function assertProjectSaveFileSize(file: FileIntakeCandidate) {
    const size = file.size ?? 0
    if (size > FILE_INTAKE_LIMITS.MAX_PROJECT_SAVE_BYTES) {
        throw new FileIntakeError(
            "project-too-large",
            FILE_INTAKE_MESSAGES.projectTooLarge
        )
    }
}

export function assertRasterImageFileCandidate(file: FileIntakeCandidate) {
    if (!isLikelyRasterImageFile(file)) {
        throw new FileIntakeError(
            "unsupported-file",
            FILE_INTAKE_MESSAGES.unsupportedFile
        )
    }

    const size = file.size ?? 0
    if (size > FILE_INTAKE_LIMITS.MAX_IMAGE_BYTES) {
        throw new FileIntakeError(
            "image-too-large",
            FILE_INTAKE_MESSAGES.imageTooLarge
        )
    }
}

export function assertDecodedImageDimensions(dimensions: {
    width: number
    height: number
}) {
    const { width, height } = dimensions
    const totalPixels = width * height

    if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        width > FILE_INTAKE_LIMITS.MAX_IMAGE_WIDTH ||
        height > FILE_INTAKE_LIMITS.MAX_IMAGE_HEIGHT ||
        totalPixels > FILE_INTAKE_LIMITS.MAX_IMAGE_PIXELS
    ) {
        throw new FileIntakeError(
            "image-too-large",
            FILE_INTAKE_MESSAGES.imageTooLarge
        )
    }
}

export function getFileIntakeUserMessage(error: unknown, fallback: string) {
    return error instanceof FileIntakeError ? error.userMessage : fallback
}

export async function decodeAndValidateRasterImageFile(
    file: File
): Promise<ImageBitmap> {
    assertRasterImageFileCandidate(file)

    if (typeof createImageBitmap !== "function") {
        throw new FileIntakeError(
            "image-decode-failed",
            FILE_INTAKE_MESSAGES.imageDecodeFailed
        )
    }

    let bitmap: ImageBitmap
    try {
        try {
            bitmap = await createImageBitmap(file, {
                imageOrientation: "from-image",
            } as ImageBitmapOptions)
        } catch {
            bitmap = await createImageBitmap(file)
        }
    } catch {
        throw new FileIntakeError(
            "image-decode-failed",
            FILE_INTAKE_MESSAGES.imageDecodeFailed
        )
    }

    try {
        assertDecodedImageDimensions(bitmap)
        return bitmap
    } catch (error) {
        bitmap.close()
        throw error
    }
}
