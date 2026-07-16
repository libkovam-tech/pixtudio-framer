type Rgb = { r: number; g: number; b: number }
type Oklab = { l: number; a: number; b: number }

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

export function quantizeFixedPaletteOklab(
    pixels: (string | null)[][],
    paletteColors: string[]
): (string | null)[][] {
    const palette = paletteColors.map((color) => ({
        color: rgbToCss(parseColor(color)),
        lab: rgbToOklab(parseColor(color)),
    }))
    if (palette.length === 0) return pixels.map((row) => row.slice())

    return pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null
            const lab = rgbToOklab(parseColor(color))
            let best = palette[0]
            let bestDistance = Number.POSITIVE_INFINITY
            for (const candidate of palette) {
                const distance = oklabDistanceSq(lab, candidate.lab)
                if (distance < bestDistance) {
                    bestDistance = distance
                    best = candidate
                }
            }
            return best.color
        })
    )
}
