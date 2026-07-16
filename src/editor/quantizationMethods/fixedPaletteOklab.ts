type Rgb = { r: number; g: number; b: number }
type Oklab = { l: number; a: number; b: number }
type Hsv = { h: number; s: number; v: number }
type FixedPaletteEntry = {
    color: string
    lab: Oklab
    hsv: Hsv
}
type SourceColorEntry = {
    color: string
    lab: Oklab
    hsv: Hsv
    count: number
    baselineIndex: number
}

export const USE_OBJECTIVE_FIXED_PALETTE_MAPPER_CANDIDATE = true

function parseColor(color: string): Rgb {
    const rgb = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(color)
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

function rgbToCss({ r, g, b }: Rgb): string {
    return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

function rgbToHsv({ r, g, b }: Rgb): Hsv {
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

function srgbToLinear(value: number): number {
    const n = value / 255
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
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

function oklabDistanceSq(a: Oklab, b: Oklab): number {
    const dl = a.l - b.l
    const da = a.a - b.a
    const db = a.b - b.b
    return dl * dl + da * da + db * db
}

function hueDistance01(a: number, b: number): number {
    const diff = Math.abs(a - b) % 360
    return Math.min(diff, 360 - diff) / 180
}

function makeFixedPaletteEntries(paletteColors: string[]): FixedPaletteEntry[] {
    return paletteColors.map((color) => {
        const rgb = parseColor(color)
        return {
            color: rgbToCss(rgb),
            lab: rgbToOklab(rgb),
            hsv: rgbToHsv(rgb),
        }
    })
}

function findNearestOklabIndex(
    lab: Oklab,
    palette: ReadonlyArray<FixedPaletteEntry>
): number {
    let bestIndex = 0
    let bestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < palette.length; i += 1) {
        const distance = oklabDistanceSq(lab, palette[i].lab)
        if (distance < bestDistance) {
            bestDistance = distance
            bestIndex = i
        }
    }
    return bestIndex
}

function collectSourceColors(
    pixels: (string | null)[][],
    palette: ReadonlyArray<FixedPaletteEntry>
): { entries: SourceColorEntry[]; total: number; baselineUsage: number[] } {
    const byColor = new Map<string, SourceColorEntry>()
    const baselineUsage = Array.from({ length: palette.length }, () => 0)
    let total = 0

    for (const row of pixels) {
        for (const color of row) {
            if (color == null) continue
            const rgb = parseColor(color)
            const key = rgbToCss(rgb)
            let entry = byColor.get(key)
            if (!entry) {
                const lab = rgbToOklab(rgb)
                entry = {
                    color: key,
                    lab,
                    hsv: rgbToHsv(rgb),
                    count: 0,
                    baselineIndex: findNearestOklabIndex(lab, palette),
                }
                byColor.set(key, entry)
            }
            entry.count += 1
            baselineUsage[entry.baselineIndex] += 1
            total += 1
        }
    }

    return { entries: [...byColor.values()], total, baselineUsage }
}

function chooseObjectiveFixedPaletteEntry(input: {
    source: SourceColorEntry
    palette: ReadonlyArray<FixedPaletteEntry>
    baselineUsage: ReadonlyArray<number>
    total: number
}): FixedPaletteEntry {
    const { source, palette, baselineUsage, total } = input
    const baseline = palette[source.baselineIndex]
    const sourceArea = total > 0 ? source.count / total : 1
    const rareAccent =
        source.hsv.s *
        Math.sqrt(source.hsv.v) *
        (sourceArea <= 0.08
            ? 1
            : sourceArea <= 0.25
              ? (0.25 - sourceArea) / 0.17
              : 0)
    const idealUsage = total / Math.max(1, palette.length)

    let best = baseline
    let bestScore = Number.POSITIVE_INFINITY

    for (let index = 0; index < palette.length; index += 1) {
        const candidate = palette[index]
        const labDistance = oklabDistanceSq(source.lab, candidate.lab)
        const hueDistance = hueDistance01(source.hsv.h, candidate.hsv.h)
        const huePenalty =
            source.hsv.s *
            candidate.hsv.s *
            hueDistance *
            hueDistance *
            0.08
        const chromaPenalty =
            Math.abs(source.hsv.s - candidate.hsv.s) * source.hsv.s * 0.012
        const underUse =
            idealUsage > 0
                ? Math.max(0, 1 - (baselineUsage[index] ?? 0) / idealUsage)
                : 0
        const hueCompatibility =
            candidate.hsv.s < 0.12 ? 0 : Math.max(0, 1 - hueDistance)
        const rareAccentBoost = rareAccent * underUse * hueCompatibility * 0.08
        const score = labDistance + huePenalty + chromaPenalty - rareAccentBoost

        if (score < bestScore) {
            bestScore = score
            best = candidate
        }
    }

    return best
}

export function quantizeFixedPaletteOklab(
    pixels: (string | null)[][],
    paletteColors: string[]
): (string | null)[][] {
    const palette = makeFixedPaletteEntries(paletteColors)
    if (palette.length === 0) return pixels.map((row) => row.slice())

    return pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null
            const lab = rgbToOklab(parseColor(color))
            const best = palette[findNearestOklabIndex(lab, palette)]
            return best.color
        })
    )
}

export function quantizeFixedPaletteObjectiveCandidate(
    pixels: (string | null)[][],
    paletteColors: string[]
): (string | null)[][] {
    const palette = makeFixedPaletteEntries(paletteColors)
    if (palette.length === 0) return pixels.map((row) => row.slice())

    const { entries, total, baselineUsage } = collectSourceColors(
        pixels,
        palette
    )
    const colorMap = new Map(
        entries.map((entry) => [
            entry.color,
            chooseObjectiveFixedPaletteEntry({
                source: entry,
                palette,
                baselineUsage,
                total,
            }).color,
        ])
    )

    return pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null
            const key = rgbToCss(parseColor(color))
            return colorMap.get(key) ?? key
        })
    )
}

export function quantizeFixedPaletteForApplication(
    pixels: (string | null)[][],
    paletteColors: string[]
): (string | null)[][] {
    if (USE_OBJECTIVE_FIXED_PALETTE_MAPPER_CANDIDATE) {
        return quantizeFixedPaletteObjectiveCandidate(pixels, paletteColors)
    }
    return quantizeFixedPaletteOklab(pixels, paletteColors)
}
