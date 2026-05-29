export type OpenFileRoute = "project" | "image" | "unsupported"

export type OpenFileCandidate = {
    name?: string
    type?: string
}

const PROJECT_EXTENSIONS = new Set(["pixtudio"])
const PROJECT_MIME_TYPES = new Set([
    "application/json",
    "application/pixtudio+json",
])
const IMAGE_EXTENSIONS = new Set([
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "bmp",
    "avif",
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

export function isLikelyProjectSaveFile(file: OpenFileCandidate): boolean {
    const ext = normalizedExtension(file.name)
    const mime = normalizedMime(file.type)
    return PROJECT_EXTENSIONS.has(ext) || PROJECT_MIME_TYPES.has(mime)
}

export function isLikelyRasterImageFile(file: OpenFileCandidate): boolean {
    const ext = normalizedExtension(file.name)
    const mime = normalizedMime(file.type)
    return mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext)
}

export function routeOpenFile(file: OpenFileCandidate | null | undefined): OpenFileRoute {
    if (!file) return "unsupported"

    if (isLikelyProjectSaveFile(file)) return "project"
    if (isLikelyRasterImageFile(file)) return "image"
    return "unsupported"
}

