import { extractPaletteOklabTournament } from "./quantizationMethods/autoPaletteOklabTournament.ts"
import { quantizeFixedPaletteOklab } from "./quantizationMethods/fixedPaletteOklab.ts"

export type QuantizationProfile =
    | {
          kind: "extract"
      }
    | {
          kind: "fixed"
          id: string
          name: string
          source: "builtin" | "imported"
          colors: string[]
      }

export type PaletteTab = "size" | "presets"

export type QuantizationSwatch = {
    id: string
    color: string
    isTransparent: boolean
    isUser: boolean
}

export type QuantizationPixel = string | null

export type DerivedWorld<TPixel extends string | null = QuantizationPixel> = {
    profile: QuantizationProfile
    referenceSignature?: string | null
    autoSwatches: QuantizationSwatch[]
    imagePixels: TPixel[][]
    overlayPixels: TPixel[][]
    canvasPixels: TPixel[][]
}

export type PaletteTabsState<TPixel extends string | null = QuantizationPixel> = {
    activeTab: PaletteTab
    sizeWorld: DerivedWorld<TPixel> | null
    presetsWorld: DerivedWorld<TPixel> | null
}

export const EXTRACT_QUANTIZATION_PROFILE: QuantizationProfile = {
    kind: "extract",
}

export const NEON_COLD_32: string[] = [
    "#0B0A1A",
    "#16132B",
    "#1E1A3A",
    "#241F4A",
    "#2C255C",
    "#332A6E",
    "#2E3A8C",
    "#3547A8",
    "#3C54C2",
    "#4662DA",
    "#5270F0",
    "#5F63E0",
    "#6E6AE8",
    "#7E72EE",
    "#8E7BF2",
    "#9B7BE0",
    "#A783E6",
    "#B28CEC",
    "#BD96F0",
    "#C9A0F4",
    "#D6A9F7",
    "#E2B3FA",
    "#EDBEFC",
    "#F6CAFD",
    "#F3E6FF",
    "#E9DDF8",
    "#DCD1F0",
    "#BFD6FF",
    "#9AD8FF",
    "#5BC2FF",
    "#4ED6C4",
    "#FF6AD5",
]

export const GRAYSCALE_32: string[] = [
    "#000000",
    "#080808",
    "#101010",
    "#181818",
    "#212121",
    "#292929",
    "#313131",
    "#393939",
    "#424242",
    "#4A4A4A",
    "#525252",
    "#5A5A5A",
    "#636363",
    "#6B6B6B",
    "#737373",
    "#7B7B7B",
    "#848484",
    "#8C8C8C",
    "#949494",
    "#9C9C9C",
    "#A5A5A5",
    "#ADADAD",
    "#B5B5B5",
    "#BDBDBD",
    "#C6C6C6",
    "#CECECE",
    "#D6D6D6",
    "#DEDEDE",
    "#E7E7E7",
    "#EFEFEF",
    "#F7F7F7",
    "#FFFFFF",
]

export const BLACK_WHITE_2: string[] = ["#000000", "#FFFFFF"]

export const QUANTIZATION_PROFILES = {
    extract: EXTRACT_QUANTIZATION_PROFILE,
    neon: {
        kind: "fixed",
        id: "neon-cold-32",
        name: "NEON",
        source: "builtin",
        colors: NEON_COLD_32,
    },
    grayscale: {
        kind: "fixed",
        id: "grayscale-32",
        name: "GRAY",
        source: "builtin",
        colors: GRAYSCALE_32,
    },
    bw: {
        kind: "fixed",
        id: "black-white-2",
        name: "B/W",
        source: "builtin",
        colors: BLACK_WHITE_2,
    },
} satisfies Record<string, QuantizationProfile>

type Rgb = { r: number; g: number; b: number }

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function parseRgbColor(color: string): Rgb {
    const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(color)
    if (rgb) {
        return {
            r: parseInt(rgb[1], 10),
            g: parseInt(rgb[2], 10),
            b: parseInt(rgb[3], 10),
        }
    }

    const hex = color.trim().replace(/^#/, "")
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        }
    }

    return { r: 0, g: 0, b: 0 }
}

function rgbToCss({ r, g, b }: Rgb): string {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

function luma255({ r, g, b }: Rgb): number {
    return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
}

function colorDistanceSq(a: Rgb, b: Rgb): number {
    const dr = a.r - b.r
    const dg = a.g - b.g
    const db = a.b - b.b
    return dr * dr + dg * dg + db * db
}

function cloneGrid<T>(grid: T[][]): T[][] {
    return grid.map((row) => row.slice())
}

function makeEmptyGrid<T>(size: number, value: T): T[][] {
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => value)
    )
}

function overlayOverBase<TPixel extends string | null>(
    base: TPixel[][],
    overlay: TPixel[][]
): TPixel[][] {
    const size = base.length
    const out = makeEmptyGrid<TPixel>(size, null as TPixel)

    for (let r = 0; r < size; r++) {
        const baseRow = base[r] || []
        const overlayRow = overlay[r] || []
        const outRow = out[r]
        for (let c = 0; c < size; c++) {
            const overlayPixel = (overlayRow[c] ?? null) as TPixel
            outRow[c] =
                overlayPixel !== null
                    ? overlayPixel
                    : ((baseRow[c] ?? null) as TPixel)
        }
    }

    return out
}

export function quantizeWithFixedPalette(
    pixels: QuantizationPixel[][],
    paletteColors: string[]
): QuantizationPixel[][] {
    return quantizeFixedPaletteOklab(pixels, paletteColors)
    // RGB baseline rollback: return quantizeWithFixedPaletteRgbBaseline(pixels, paletteColors)
}

function quantizeWithFixedPaletteRgbBaseline(
    pixels: QuantizationPixel[][],
    paletteColors: string[]
): QuantizationPixel[][] {
    const safePalette = paletteColors.map(parseRgbColor)
    if (safePalette.length === 0) return cloneGrid(pixels)

    return pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null
            const rgb = parseRgbColor(color)
            let bestIndex = 0
            let bestDistance = Number.POSITIVE_INFINITY

            for (let i = 0; i < safePalette.length; i++) {
                const distance = colorDistanceSq(rgb, safePalette[i])
                if (distance < bestDistance) {
                    bestDistance = distance
                    bestIndex = i
                }
            }

            return rgbToCss(safePalette[bestIndex])
        })
    )
}
void quantizeWithFixedPaletteRgbBaseline

function quantizeWithGrayscaleProfile(
    pixels: QuantizationPixel[][]
): QuantizationPixel[][] {
    const parsedPalette = GRAYSCALE_32.map(parseRgbColor)
    return pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null
            const gray = luma255(parseRgbColor(color))
            let bestIndex = 0
            let bestDistance = Number.POSITIVE_INFINITY
            for (let i = 0; i < parsedPalette.length; i++) {
                const distance = Math.abs(gray - parsedPalette[i].r)
                if (distance < bestDistance) {
                    bestDistance = distance
                    bestIndex = i
                }
            }
            return GRAYSCALE_32[bestIndex]
        })
    )
}

function quantizeWithBlackWhiteProfile(
    pixels: QuantizationPixel[][]
): QuantizationPixel[][] {
    return pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null
            const gray = luma255(parseRgbColor(color))
            return gray / 255 < 0.5 ? BLACK_WHITE_2[0] : BLACK_WHITE_2[1]
        })
    )
}

export function quantizeWithFixedProfile(
    pixels: QuantizationPixel[][],
    profile: Extract<QuantizationProfile, { kind: "fixed" }>
): QuantizationPixel[][] {
    if (profile.id === "grayscale-32") return quantizeWithGrayscaleProfile(pixels)
    if (profile.id === "black-white-2") {
        return quantizeWithBlackWhiteProfile(pixels)
    }
    return quantizeWithFixedPalette(pixels, profile.colors)
}

export function extractPalette(
    pixels: QuantizationPixel[][],
    targetColors: number
): { pixels: QuantizationPixel[][]; palette: string[] } {
    return extractPaletteOklabTournament(pixels, targetColors)
    // RGB baseline rollback: return extractPaletteRgbBaseline(pixels, targetColors)
}

function extractPaletteRgbBaseline(
    pixels: QuantizationPixel[][],
    targetColors: number
): { pixels: QuantizationPixel[][]; palette: string[] } {
    const height = pixels.length
    const width = height > 0 ? pixels[0].length : 0

    const map = new Map<
        string,
        { color: string; r: number; g: number; b: number; count: number }
    >()
    for (let y = 0; y < height; y++) {
        const row = pixels[y]
        for (let x = 0; x < width; x++) {
            const color = row[x]
            if (color == null) continue
            let entry = map.get(color)
            if (!entry) {
                const { r, g, b } = parseRgbColor(color)
                entry = { color, r, g, b, count: 0 }
                map.set(color, entry)
            }
            entry.count++
        }
    }

    const uniqueColors = Array.from(map.values())
    if (uniqueColors.length === 0) return { pixels, palette: [] }

    const k = clamp(targetColors, 1, uniqueColors.length)
    if (uniqueColors.length <= k) {
        return { pixels, palette: uniqueColors.map((c) => c.color) }
    }

    const centroids = uniqueColors
        .slice(0, k)
        .map((c) => ({ r: c.r, g: c.g, b: c.b }))
    const iterations = 6

    for (let iter = 0; iter < iterations; iter++) {
        const clusters = centroids.map(() => ({
            sumR: 0,
            sumG: 0,
            sumB: 0,
            sumCount: 0,
        }))

        for (const color of uniqueColors) {
            let bestIndex = 0
            let bestDistance = Number.POSITIVE_INFINITY
            for (let i = 0; i < centroids.length; i++) {
                const distance = colorDistanceSq(color, centroids[i])
                if (distance < bestDistance) {
                    bestDistance = distance
                    bestIndex = i
                }
            }
            const cluster = clusters[bestIndex]
            cluster.sumR += color.r * color.count
            cluster.sumG += color.g * color.count
            cluster.sumB += color.b * color.count
            cluster.sumCount += color.count
        }

        for (let i = 0; i < centroids.length; i++) {
            const cluster = clusters[i]
            if (cluster.sumCount > 0) {
                centroids[i] = {
                    r: cluster.sumR / cluster.sumCount,
                    g: cluster.sumG / cluster.sumCount,
                    b: cluster.sumB / cluster.sumCount,
                }
            }
        }
    }

    const palette = centroids.map(rgbToCss)
    const mapping = new Map<string, string>()

    for (const color of uniqueColors) {
        let bestIndex = 0
        let bestDistance = Number.POSITIVE_INFINITY
        for (let i = 0; i < centroids.length; i++) {
            const distance = colorDistanceSq(color, centroids[i])
            if (distance < bestDistance) {
                bestDistance = distance
                bestIndex = i
            }
        }
        mapping.set(color.color, palette[bestIndex])
    }

    const quantizedPixels = pixels.map((row) =>
        row.map((color) => (color == null ? null : mapping.get(color) || color))
    )

    return { pixels: quantizedPixels, palette }
}
void extractPaletteRgbBaseline

export function remapOverlay<TPixel extends string | null>(params: {
    overlayPixels: TPixel[][]
    swatches: QuantizationSwatch[]
    targetAutoSwatches: QuantizationSwatch[]
}): TPixel[][] {
    const sourceById = new Map<string, QuantizationSwatch>()
    for (const swatch of params.swatches) sourceById.set(swatch.id, swatch)

    const targetAuto = params.targetAutoSwatches.filter(
        (swatch) => !swatch.isTransparent
    )
    if (targetAuto.length === 0) return cloneGrid(params.overlayPixels)

    const targetRgb = targetAuto.map((swatch) => parseRgbColor(swatch.color))
    const remap = new Map<string, string>()

    for (const swatch of params.swatches) {
        if (swatch.isUser || swatch.isTransparent) {
            remap.set(swatch.id, swatch.id)
            continue
        }

        const rgb = parseRgbColor(swatch.color)
        let bestIndex = 0
        let bestDistance = Number.POSITIVE_INFINITY
        for (let i = 0; i < targetRgb.length; i++) {
            const distance = colorDistanceSq(rgb, targetRgb[i])
            if (distance < bestDistance) {
                bestDistance = distance
                bestIndex = i
            }
        }
        remap.set(swatch.id, targetAuto[bestIndex].id)
    }

    return params.overlayPixels.map((row) =>
        row.map((pixel) => {
            if (pixel == null) return pixel
            const source = sourceById.get(pixel)
            if (!source) return pixel
            return (remap.get(source.id) ?? pixel) as TPixel
        })
    )
}

export function buildDerivedWorld<TPixel extends string | null>(params: {
    profile: QuantizationProfile
    sourcePixels: QuantizationPixel[][]
    overlayPixels: TPixel[][]
    previousSwatches: QuantizationSwatch[]
    userSwatches: QuantizationSwatch[]
    paletteCountTarget: number
    makeAutoSwatchId?: (index: number) => string
}): DerivedWorld<TPixel> {
    const makeAutoSwatchId =
        params.makeAutoSwatchId ?? ((index: number) => `auto-${index}`)
    const result =
        params.profile.kind === "extract"
            ? extractPalette(params.sourcePixels, params.paletteCountTarget)
            : {
              pixels: quantizeWithFixedProfile(
                  params.sourcePixels,
                  params.profile
              ),
              palette: params.profile.colors,
          }

    const autoSwatches = result.palette.map((color, index) => ({
        id: makeAutoSwatchId(index),
        color,
        isTransparent: false,
        isUser: false,
    }))

    const overlayPixels = remapOverlay({
        overlayPixels: params.overlayPixels,
        swatches: [...params.previousSwatches, ...params.userSwatches],
        targetAutoSwatches: autoSwatches,
    })

    const paletteKeys = result.palette.map((color) =>
        rgbToCss(parseRgbColor(color))
    )
    const imagePixels = result.pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null as TPixel
            const index = paletteKeys.indexOf(rgbToCss(parseRgbColor(color)))
            return (index >= 0 ? makeAutoSwatchId(index) : null) as TPixel
        })
    )

    return {
        profile: params.profile,
        autoSwatches,
        imagePixels,
        overlayPixels,
        canvasPixels: overlayOverBase(imagePixels, overlayPixels),
    }
}
