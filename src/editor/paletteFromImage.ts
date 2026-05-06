import { extractPalette, type QuantizationPixel } from "./paletteQuantizationEngine.ts"

const DEFAULT_TARGET_COLORS = 32
const DEFAULT_SAMPLE_MAX_SIDE = 160

function clampInt(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, Math.round(value)))
}

function componentToHex(value: number) {
    return clampInt(value, 0, 255).toString(16).toUpperCase().padStart(2, "0")
}

function rgbToHex(r: number, g: number, b: number) {
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`
}

function cssColorToHex(color: string) {
    const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(color)
    if (rgb) {
        return rgbToHex(Number(rgb[1]), Number(rgb[2]), Number(rgb[3]))
    }

    const hex = color.trim().replace(/^#/, "")
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toUpperCase()}`

    return color
}

function getImageSampleSize(width: number, height: number, maxSide: number) {
    const longest = Math.max(1, width, height)
    const scale = Math.min(1, maxSide / longest)
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    }
}

async function decodeImageFile(file: File): Promise<ImageBitmap> {
    if (!file.type.startsWith("image/")) {
        throw new Error("paletteFromImage: expected an image file")
    }

    if (typeof createImageBitmap !== "function") {
        throw new Error("paletteFromImage: createImageBitmap is unavailable")
    }

    try {
        return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
        return await createImageBitmap(file)
    }
}

function imageBitmapToSamplePixels(
    bitmap: ImageBitmap,
    sampleMaxSide: number
): QuantizationPixel[][] {
    const { width, height } = getImageSampleSize(
        bitmap.width,
        bitmap.height,
        sampleMaxSide
    )
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext("2d", { willReadFrequently: true })
    if (!ctx) throw new Error("paletteFromImage: canvas context unavailable")

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)

    const imageData = ctx.getImageData(0, 0, width, height)
    const pixels: QuantizationPixel[][] = []
    for (let y = 0; y < height; y += 1) {
        const row: QuantizationPixel[] = []
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 4
            const a = imageData.data[i + 3] ?? 255
            if (a < 16) {
                row.push(null)
                continue
            }
            row.push(
                rgbToHex(
                    imageData.data[i] ?? 0,
                    imageData.data[i + 1] ?? 0,
                    imageData.data[i + 2] ?? 0
                )
            )
        }
        pixels.push(row)
    }
    return pixels
}

export async function extractPaletteFromImageFile(
    file: File,
    options: {
        targetColors?: number
        sampleMaxSide?: number
    } = {}
): Promise<string[]> {
    const targetColors = options.targetColors ?? DEFAULT_TARGET_COLORS
    const sampleMaxSide = options.sampleMaxSide ?? DEFAULT_SAMPLE_MAX_SIDE
    const bitmap = await decodeImageFile(file)

    try {
        const pixels = imageBitmapToSamplePixels(bitmap, sampleMaxSide)
        const result = extractPalette(pixels, targetColors)
        return result.palette.map(cssColorToHex)
    } finally {
        bitmap.close()
    }
}
