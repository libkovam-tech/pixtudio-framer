import { extractPaletteOklabTournament } from "./quantizationMethods/autoPaletteOklabTournament.ts"
import { quantizeFixedPaletteOklab } from "./quantizationMethods/fixedPaletteOklab.ts"

type Rgb = { r: number; g: number; b: number }
type Oklab = { l: number; a: number; b: number }
type PalettePixel = string | null

// Rollback switch: set legacy to true and objective to false to restore the old
// weighted imported-palette path in one local place.
export const USE_LEGACY_WEIGHTED_IMPORTED_PALETTE_PIPELINE = false
export const USE_OBJECTIVE_UNIQUE_IMPORTED_PALETTE_PIPELINE = true

const OBJECTIVE_CLUSTER_ITERATIONS = 8

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function componentToHex(value: number): string {
    return Math.round(clamp(value, 0, 255))
        .toString(16)
        .toUpperCase()
        .padStart(2, "0")
}

function rgbToHex({ r, g, b }: Rgb): string {
    return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`
}

function parseColor(color: string): Rgb {
    const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i.exec(color)
    if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }

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

function srgbToLinear(value: number): number {
    const n = value / 255
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
    const n =
        value <= 0.0031308
            ? value * 12.92
            : 1.055 * value ** (1 / 2.4) - 0.055
    return clamp(n * 255, 0, 255)
}

function rgbToOklab(rgb: Rgb): Oklab {
    const r = srgbToLinear(rgb.r)
    const g = srgbToLinear(rgb.g)
    const b = srgbToLinear(rgb.b)
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    const l3 = Math.cbrt(l)
    const m3 = Math.cbrt(m)
    const s3 = Math.cbrt(s)
    return {
        l: 0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
        a: 1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
        b: 0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
    }
}

function oklabToRgb(lab: Oklab): Rgb {
    const l3 = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b
    const m3 = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b
    const s3 = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b
    const l = l3 * l3 * l3
    const m = m3 * m3 * m3
    const s = s3 * s3 * s3

    return {
        r: linearToSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    }
}

function oklabDistanceSq(a: Oklab, b: Oklab): number {
    const dl = a.l - b.l
    const da = a.a - b.a
    const db = a.b - b.b
    return dl * dl + da * da + db * db
}

function rgbToHsv({ r, g, b }: Rgb): { h: number; s: number; v: number } {
    const rr = r / 255
    const gg = g / 255
    const bb = b / 255
    const max = Math.max(rr, gg, bb)
    const min = Math.min(rr, gg, bb)
    const d = max - min
    let h = 0

    if (d !== 0) {
        if (max === rr) h = ((gg - bb) / d) % 6
        else if (max === gg) h = (bb - rr) / d + 2
        else h = (rr - gg) / d + 4
        h *= 60
        if (h < 0) h += 360
    }

    return { h, s: max === 0 ? 0 : d / max, v: max }
}

function autoPaletteSortKey(color: string): [number, number, number, string] {
    const rgb = parseColor(color)
    const { h, s, v } = rgbToHsv(rgb)
    if (s < 0.08) return [3, v, s, rgbToHex(rgb)]

    const group = h < 60 || h >= 300 ? 0 : h < 180 ? 1 : 2
    const hueAdjusted = group === 0 && h >= 300 ? h - 360 : h
    return [group, hueAdjusted, s, rgbToHex(rgb)]
}

export function sortImportedPaletteLikeAutoPalette(colors: string[]): string[] {
    return [...new Set(colors.map((color) => rgbToHex(parseColor(color))))].sort(
        (a, b) => {
            const aa = autoPaletteSortKey(a)
            const bb = autoPaletteSortKey(b)
            for (let i = 0; i < aa.length; i += 1) {
                if (aa[i] < bb[i]) return -1
                if (aa[i] > bb[i]) return 1
            }
            return 0
        }
    )
}

function collectUniqueColors(pixels: PalettePixel[][]): string[] {
    const colors = new Set<string>()
    for (const row of pixels) {
        for (const color of row) {
            if (color == null) continue
            colors.add(rgbToHex(parseColor(color)))
        }
    }
    return sortImportedPaletteLikeAutoPalette([...colors])
}

function nearestPaletteIndex(lab: Oklab, palette: Oklab[]): number {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < palette.length; i += 1) {
        const distance = oklabDistanceSq(lab, palette[i])
        if (distance < bestDistance) {
            bestDistance = distance
            bestIndex = i
        }
    }
    return bestIndex
}

function chooseInitialCentroids(colors: string[], count: number): Oklab[] {
    const labs = colors.map((color) => rgbToOklab(parseColor(color)))
    const selectedIndexes = [0]

    while (selectedIndexes.length < count) {
        let bestIndex = 0
        let bestDistance = -1

        for (let i = 0; i < labs.length; i += 1) {
            if (selectedIndexes.includes(i)) continue
            const minDistance = Math.min(
                ...selectedIndexes.map((index) =>
                    oklabDistanceSq(labs[i], labs[index])
                )
            )
            if (minDistance > bestDistance) {
                bestDistance = minDistance
                bestIndex = i
            }
        }

        selectedIndexes.push(bestIndex)
    }

    return selectedIndexes.map((index) => ({ ...labs[index] }))
}

function objectivePaletteFromUniqueColors(
    uniqueColors: string[],
    targetColors: number
): string[] {
    if (uniqueColors.length === 0) return []

    const count = Math.max(1, Math.min(Math.round(targetColors), uniqueColors.length))
    if (uniqueColors.length <= count) return sortImportedPaletteLikeAutoPalette(uniqueColors)

    // Every unique source color has one vote here; pixel area and file order are
    // intentionally excluded from imported palette extraction.
    const uniqueLabs = uniqueColors.map((color) => rgbToOklab(parseColor(color)))
    let centroids = chooseInitialCentroids(uniqueColors, count)

    for (let iteration = 0; iteration < OBJECTIVE_CLUSTER_ITERATIONS; iteration += 1) {
        const clusters = centroids.map(() => ({
            sumL: 0,
            sumA: 0,
            sumB: 0,
            count: 0,
        }))

        for (const lab of uniqueLabs) {
            const cluster = clusters[nearestPaletteIndex(lab, centroids)]
            cluster.sumL += lab.l
            cluster.sumA += lab.a
            cluster.sumB += lab.b
            cluster.count += 1
        }

        centroids = centroids.map((centroid, index) => {
            const cluster = clusters[index]
            if (cluster.count === 0) return centroid
            return {
                l: cluster.sumL / cluster.count,
                a: cluster.sumA / cluster.count,
                b: cluster.sumB / cluster.count,
            }
        })
    }

    const palette = sortImportedPaletteLikeAutoPalette(
        centroids.map((centroid) => rgbToHex(oklabToRgb(centroid)))
    )

    if (palette.length >= count) return palette.slice(0, count)

    const paletteLabs = palette.map((color) => rgbToOklab(parseColor(color)))
    const remaining = uniqueColors.filter((color) => !palette.includes(color))
    remaining.sort((a, b) => {
        const labA = rgbToOklab(parseColor(a))
        const labB = rgbToOklab(parseColor(b))
        const distA = Math.min(...paletteLabs.map((lab) => oklabDistanceSq(labA, lab)))
        const distB = Math.min(...paletteLabs.map((lab) => oklabDistanceSq(labB, lab)))
        return distB - distA || a.localeCompare(b)
    })

    return sortImportedPaletteLikeAutoPalette([
        ...palette,
        ...remaining.slice(0, count - palette.length),
    ])
}

function extractLegacyImportedPalette(
    pixels: PalettePixel[][],
    targetColors: number
): string[] {
    return extractPaletteOklabTournament(pixels, targetColors).palette.map((color) =>
        rgbToHex(parseColor(color))
    )
}

function extractObjectiveImportedPalette(
    pixels: PalettePixel[][],
    targetColors: number
): string[] {
    return objectivePaletteFromUniqueColors(collectUniqueColors(pixels), targetColors)
}

export function extractImportedPaletteColors(
    pixels: PalettePixel[][],
    targetColors: number
): string[] {
    if (USE_LEGACY_WEIGHTED_IMPORTED_PALETTE_PIPELINE) {
        return extractLegacyImportedPalette(pixels, targetColors)
    }
    if (USE_OBJECTIVE_UNIQUE_IMPORTED_PALETTE_PIPELINE) {
        return extractObjectiveImportedPalette(pixels, targetColors)
    }
    return extractLegacyImportedPalette(pixels, targetColors)
}

export function prepareImportedPaletteColorsForApplication(
    colors: string[]
): string[] {
    if (!USE_OBJECTIVE_UNIQUE_IMPORTED_PALETTE_PIPELINE) {
        return colors.map((color) => rgbToHex(parseColor(color)))
    }
    return sortImportedPaletteLikeAutoPalette(colors)
}

export function applyImportedPaletteToPixels(
    pixels: PalettePixel[][],
    paletteColors: string[]
): PalettePixel[][] {
    const prepared = prepareImportedPaletteColorsForApplication(paletteColors)
    return quantizeFixedPaletteOklab(pixels, prepared)
}

export function shouldUseObjectiveImportedPaletteSampling(): boolean {
    return USE_OBJECTIVE_UNIQUE_IMPORTED_PALETTE_PIPELINE
}
