type Rgb = { r: number; g: number; b: number }
type Oklab = { l: number; a: number; b: number }

type PaletteEntry = {
    color: string
    rgb: Rgb
    lab: Oklab
    count: number
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

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

function srgbToLinear(value: number): number {
    const n = value / 255
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number): number {
    const n = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
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

export function extractPaletteOklabTournament(
    pixels: (string | null)[][],
    targetColors: number
): { pixels: (string | null)[][]; palette: string[] } {
    const height = pixels.length
    const width = height > 0 ? pixels[0].length : 0

    const map = new Map<string, PaletteEntry>()
    for (let y = 0; y < height; y++) {
        const row = pixels[y]
        for (let x = 0; x < width; x++) {
            const color = row[x]
            if (color == null) continue
            let entry = map.get(color)
            if (!entry) {
                const rgb = parseColor(color)
                entry = { color, rgb, lab: rgbToOklab(rgb), count: 0 }
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
        .map((entry) => ({ ...entry.lab }))
    const iterations = 6

    for (let iter = 0; iter < iterations; iter++) {
        const clusters = centroids.map(() => ({
            sumL: 0,
            sumA: 0,
            sumB: 0,
            sumCount: 0,
        }))

        for (const color of uniqueColors) {
            let bestIndex = 0
            let bestDistance = Number.POSITIVE_INFINITY
            for (let i = 0; i < centroids.length; i++) {
                const distance = oklabDistanceSq(color.lab, centroids[i])
                if (distance < bestDistance) {
                    bestDistance = distance
                    bestIndex = i
                }
            }
            const cluster = clusters[bestIndex]
            cluster.sumL += color.lab.l * color.count
            cluster.sumA += color.lab.a * color.count
            cluster.sumB += color.lab.b * color.count
            cluster.sumCount += color.count
        }

        for (let i = 0; i < centroids.length; i++) {
            const cluster = clusters[i]
            if (cluster.sumCount > 0) {
                centroids[i] = {
                    l: cluster.sumL / cluster.sumCount,
                    a: cluster.sumA / cluster.sumCount,
                    b: cluster.sumB / cluster.sumCount,
                }
            }
        }
    }

    const palette = centroids.map((centroid) => rgbToCss(oklabToRgb(centroid)))
    const paletteLabs = palette.map((color) => rgbToOklab(parseColor(color)))
    const mapping = new Map<string, string>()

    for (const color of uniqueColors) {
        let bestIndex = 0
        let bestDistance = Number.POSITIVE_INFINITY
        for (let i = 0; i < paletteLabs.length; i++) {
            const distance = oklabDistanceSq(color.lab, paletteLabs[i])
            if (distance < bestDistance) {
                bestDistance = distance
                bestIndex = i
            }
        }
        mapping.set(color.color, palette[bestIndex])
    }

    return {
        pixels: pixels.map((row) =>
            row.map((color) => (color == null ? null : mapping.get(color) || color))
        ),
        palette,
    }
}
