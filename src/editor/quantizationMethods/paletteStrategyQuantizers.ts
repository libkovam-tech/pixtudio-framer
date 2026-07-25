export type PaletteStrategyMethodId =
    | "k-means"
    | "k-medoids"
    | "octree"
    | "median-cut"
    | "fuzzy-c-means"
    | "wu-color-quantizer"

export type PaletteStrategyColorSpaceId =
    | "default"
    | "oklab"
    | "cielab"
    | "din99"
    | "cam16-ucs"
    | "ycbcr"
    | "yuv"
    | "yiq"
    | "hsv"
    | "hsl"
    | "hsi"

type Rgb = { r: number; g: number; b: number }
type ColorEntry = {
    color: string
    rgb: Rgb
    vector: number[]
    count: number
}
type PaletteResult = {
    pixels: (string | null)[][]
    palette: string[]
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
    return `rgb(${Math.round(clamp(r, 0, 255))}, ${Math.round(
        clamp(g, 0, 255)
    )}, ${Math.round(clamp(b, 0, 255))})`
}

function rgbToHex({ r, g, b }: Rgb): string {
    const toHex = (value: number) =>
        Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

function colorKey(color: string): string {
    return rgbToHex(parseColor(color))
}

function srgbToLinear(value: number): number {
    const n = value / 255
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4
}

function rgbToOklab(rgb: Rgb): number[] {
    const r = srgbToLinear(rgb.r)
    const g = srgbToLinear(rgb.g)
    const b = srgbToLinear(rgb.b)
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    const l3 = Math.cbrt(l)
    const m3 = Math.cbrt(m)
    const s3 = Math.cbrt(s)
    return [
        0.2104542553 * l3 + 0.793617785 * m3 - 0.0040720468 * s3,
        1.9779984951 * l3 - 2.428592205 * m3 + 0.4505937099 * s3,
        0.0259040371 * l3 + 0.7827717662 * m3 - 0.808675766 * s3,
    ]
}

function rgbToXyz(rgb: Rgb): number[] {
    const r = srgbToLinear(rgb.r)
    const g = srgbToLinear(rgb.g)
    const b = srgbToLinear(rgb.b)
    return [
        0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
        0.2126729 * r + 0.7151522 * g + 0.072175 * b,
        0.0193339 * r + 0.119192 * g + 0.9503041 * b,
    ]
}

function xyzToCielab([x, y, z]: number[]): number[] {
    const white = [0.95047, 1, 1.08883]
    const f = (value: number) =>
        value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
    const fx = f(x / white[0])
    const fy = f(y / white[1])
    const fz = f(z / white[2])
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function rgbToCielab(rgb: Rgb): number[] {
    return xyzToCielab(rgbToXyz(rgb))
}

function rgbToDin99(rgb: Rgb): number[] {
    const [l, a, b] = rgbToCielab(rgb)
    const e = Math.hypot(a, b)
    const g = Math.atan2(b, a)
    return [
        105.51 * Math.log(1 + 0.0158 * l),
        Math.log(1 + 0.045 * e) * Math.cos(g),
        Math.log(1 + 0.045 * e) * Math.sin(g),
    ]
}

function rgbToHsv({ r, g, b }: Rgb): number[] {
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const delta = max - min
    let h = 0
    if (delta > 0) {
        if (max === rn) h = ((gn - bn) / delta) % 6
        else if (max === gn) h = (bn - rn) / delta + 2
        else h = (rn - gn) / delta + 4
        h /= 6
        if (h < 0) h += 1
    }
    const s = max === 0 ? 0 : delta / max
    return [Math.cos(h * Math.PI * 2) * s, Math.sin(h * Math.PI * 2) * s, max]
}

function rgbToHsl({ r, g, b }: Rgb): number[] {
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const max = Math.max(rn, gn, bn)
    const min = Math.min(rn, gn, bn)
    const lightness = (max + min) / 2
    const delta = max - min
    const saturation =
        delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1))
    const hue = rgbToHsv({ r, g, b })
    return [hue[0] * saturation, hue[1] * saturation, lightness]
}

function rgbToHsi({ r, g, b }: Rgb): number[] {
    const rn = r / 255
    const gn = g / 255
    const bn = b / 255
    const intensity = (rn + gn + bn) / 3
    const min = Math.min(rn, gn, bn)
    const saturation = intensity === 0 ? 0 : 1 - min / intensity
    const hue = rgbToHsv({ r, g, b })
    return [hue[0] * saturation, hue[1] * saturation, intensity]
}

function rgbToVector(
    rgb: Rgb,
    colorSpaceId: PaletteStrategyColorSpaceId
): number[] {
    switch (colorSpaceId) {
        case "oklab":
        case "default":
            return rgbToOklab(rgb)
        case "cielab":
            return rgbToCielab(rgb)
        case "din99":
            return rgbToDin99(rgb)
        case "cam16-ucs":
            return rgbToCielab(rgb).map((value, index) =>
                index === 0 ? value / 100 : value / 128
            )
        case "ycbcr":
            return [
                0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b,
                128 - 0.168736 * rgb.r - 0.331264 * rgb.g + 0.5 * rgb.b,
                128 + 0.5 * rgb.r - 0.418688 * rgb.g - 0.081312 * rgb.b,
            ]
        case "yuv":
            return [
                0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b,
                -0.14713 * rgb.r - 0.28886 * rgb.g + 0.436 * rgb.b,
                0.615 * rgb.r - 0.51499 * rgb.g - 0.10001 * rgb.b,
            ]
        case "yiq":
            return [
                0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b,
                0.596 * rgb.r - 0.274 * rgb.g - 0.322 * rgb.b,
                0.211 * rgb.r - 0.523 * rgb.g + 0.312 * rgb.b,
            ]
        case "hsv":
            return rgbToHsv(rgb)
        case "hsl":
            return rgbToHsl(rgb)
        case "hsi":
            return rgbToHsi(rgb)
        default:
            return [rgb.r, rgb.g, rgb.b]
    }
}

function distanceSq(a: number[], b: number[]): number {
    let sum = 0
    for (let index = 0; index < a.length; index++) {
        const delta = (a[index] ?? 0) - (b[index] ?? 0)
        sum += delta * delta
    }
    return sum
}

function collectEntries(
    pixels: (string | null)[][],
    colorSpaceId: PaletteStrategyColorSpaceId,
    excludedColors: string[] = []
): { all: ColorEntry[]; usable: ColorEntry[] } {
    const map = new Map<string, ColorEntry>()
    for (const row of pixels) {
        for (const color of row) {
            if (color == null) continue
            const key = colorKey(color)
            let entry = map.get(key)
            if (!entry) {
                const rgb = parseColor(color)
                entry = {
                    color,
                    rgb,
                    vector: rgbToVector(rgb, colorSpaceId),
                    count: 0,
                }
                map.set(key, entry)
            }
            entry.count++
        }
    }

    const excluded = new Set(excludedColors.map(colorKey))
    const all = Array.from(map.values())
    return {
        all,
        usable: all.filter((entry) => !excluded.has(colorKey(entry.color))),
    }
}

function weightedAverageRgb(entries: ColorEntry[]): Rgb {
    let count = 0
    let r = 0
    let g = 0
    let b = 0
    for (const entry of entries) {
        count += entry.count
        r += entry.rgb.r * entry.count
        g += entry.rgb.g * entry.count
        b += entry.rgb.b * entry.count
    }
    return count > 0
        ? { r: r / count, g: g / count, b: b / count }
        : { r: 0, g: 0, b: 0 }
}

function nearestPaletteColor(
    entry: ColorEntry,
    palette: ColorEntry[]
): ColorEntry {
    let best = palette[0]
    let bestDistance = Number.POSITIVE_INFINITY
    for (const candidate of palette) {
        const distance = distanceSq(entry.vector, candidate.vector)
        if (distance < bestDistance) {
            best = candidate
            bestDistance = distance
        }
    }
    return best
}

function mapPixelsToPalette(
    pixels: (string | null)[][],
    colorSpaceId: PaletteStrategyColorSpaceId,
    paletteColors: string[]
): (string | null)[][] {
    const palette = paletteColors.map((color) => {
        const rgb = parseColor(color)
        return {
            color,
            rgb,
            vector: rgbToVector(rgb, colorSpaceId),
            count: 1,
        }
    })
    if (palette.length === 0) return pixels.map((row) => row.slice())

    return pixels.map((row) =>
        row.map((color) => {
            if (color == null) return null
            const rgb = parseColor(color)
            const entry = {
                color,
                rgb,
                vector: rgbToVector(rgb, colorSpaceId),
                count: 1,
            }
            return nearestPaletteColor(entry, palette).color
        })
    )
}

function makePaletteEntry(
    rgb: Rgb,
    colorSpaceId: PaletteStrategyColorSpaceId
): ColorEntry {
    const color = rgbToCss(rgb)
    return {
        color,
        rgb: parseColor(color),
        vector: rgbToVector(parseColor(color), colorSpaceId),
        count: 1,
    }
}

function pickInitialCenters(entries: ColorEntry[], count: number): ColorEntry[] {
    const centers: ColorEntry[] = []
    const sorted = entries
        .slice()
        .sort((a, b) => b.count - a.count || a.color.localeCompare(b.color))
    if (!sorted[0]) return centers
    centers.push(sorted[0])
    while (centers.length < count && centers.length < sorted.length) {
        let best = sorted[0]
        let bestDistance = -1
        for (const entry of sorted) {
            if (centers.includes(entry)) continue
            const distance = Math.min(
                ...centers.map((center) => distanceSq(entry.vector, center.vector))
            )
            if (distance > bestDistance) {
                best = entry
                bestDistance = distance
            }
        }
        centers.push(best)
    }
    return centers
}

function quantizeKMeans(
    entries: ColorEntry[],
    count: number,
    colorSpaceId: PaletteStrategyColorSpaceId,
    fuzzy = false
): string[] {
    let centers = pickInitialCenters(entries, count).map((entry) => ({
        ...entry,
        rgb: { ...entry.rgb },
        vector: entry.vector.slice(),
    }))
    const iterations = fuzzy ? 8 : 7
    for (let iteration = 0; iteration < iterations; iteration++) {
        const clusters = centers.map(() => [] as ColorEntry[])
        if (fuzzy) {
            const sums = centers.map(() => ({ weight: 0, r: 0, g: 0, b: 0 }))
            for (const entry of entries) {
                const distances = centers.map(
                    (center) => Math.sqrt(distanceSq(entry.vector, center.vector)) + 1e-6
                )
                const weights = distances.map((distance) => 1 / (distance * distance))
                const weightTotal = weights.reduce((sum, value) => sum + value, 0)
                for (let index = 0; index < centers.length; index++) {
                    const weight = (weights[index] / weightTotal) * entry.count
                    sums[index].weight += weight
                    sums[index].r += entry.rgb.r * weight
                    sums[index].g += entry.rgb.g * weight
                    sums[index].b += entry.rgb.b * weight
                }
            }
            centers = sums.map((sum, index) =>
                sum.weight > 0
                    ? makePaletteEntry(
                          {
                              r: sum.r / sum.weight,
                              g: sum.g / sum.weight,
                              b: sum.b / sum.weight,
                          },
                          colorSpaceId
                      )
                    : centers[index]
            )
            continue
        }

        for (const entry of entries) {
            const nearest = nearestPaletteColor(entry, centers)
            clusters[centers.indexOf(nearest)].push(entry)
        }
        centers = clusters.map((cluster, index) =>
            cluster.length > 0
                ? makePaletteEntry(weightedAverageRgb(cluster), colorSpaceId)
                : centers[index]
        )
    }
    return centers.map((center) => center.color)
}

function quantizeKMedoids(entries: ColorEntry[], count: number): string[] {
    let medoids = pickInitialCenters(entries, count)
    for (let iteration = 0; iteration < 5; iteration++) {
        const clusters = medoids.map(() => [] as ColorEntry[])
        for (const entry of entries) {
            const nearest = nearestPaletteColor(entry, medoids)
            clusters[medoids.indexOf(nearest)].push(entry)
        }
        medoids = clusters.map((cluster, index) => {
            if (cluster.length === 0) return medoids[index]
            let best = cluster[0]
            let bestCost = Number.POSITIVE_INFINITY
            for (const candidate of cluster) {
                let cost = 0
                for (const entry of cluster) {
                    cost += distanceSq(candidate.vector, entry.vector) * entry.count
                }
                if (cost < bestCost) {
                    best = candidate
                    bestCost = cost
                }
            }
            return best
        })
    }
    return medoids.map((entry) => entry.color)
}

function splitBoxes(
    entries: ColorEntry[],
    count: number,
    weightedByVariance: boolean
): ColorEntry[][] {
    const boxes = [entries.slice()]
    while (boxes.length < count) {
        let bestIndex = -1
        let bestScore = -1
        for (let index = 0; index < boxes.length; index++) {
            const box = boxes[index]
            if (box.length < 2) continue
            for (let axis = 0; axis < 3; axis++) {
                const values = box.map((entry) => entry.vector[axis] ?? 0)
                const min = Math.min(...values)
                const max = Math.max(...values)
                const range = max - min
                const score = weightedByVariance
                    ? range *
                      box.reduce((sum, entry) => sum + entry.count, 0)
                    : range
                if (score > bestScore) {
                    bestIndex = index
                    bestScore = score
                }
            }
        }
        if (bestIndex < 0) break

        const box = boxes.splice(bestIndex, 1)[0]
        let axis = 0
        let bestRange = -1
        for (let index = 0; index < 3; index++) {
            const values = box.map((entry) => entry.vector[index] ?? 0)
            const range = Math.max(...values) - Math.min(...values)
            if (range > bestRange) {
                axis = index
                bestRange = range
            }
        }
        const sorted = box
            .slice()
            .sort(
                (a, b) =>
                    (a.vector[axis] ?? 0) - (b.vector[axis] ?? 0) ||
                    a.color.localeCompare(b.color)
            )
        const total = sorted.reduce((sum, entry) => sum + entry.count, 0)
        let running = 0
        let splitIndex = Math.max(1, Math.floor(sorted.length / 2))
        for (let index = 0; index < sorted.length - 1; index++) {
            running += sorted[index].count
            if (running >= total / 2) {
                splitIndex = index + 1
                break
            }
        }
        boxes.push(sorted.slice(0, splitIndex), sorted.slice(splitIndex))
    }
    return boxes
}

function quantizeByBoxes(
    entries: ColorEntry[],
    count: number,
    weightedByVariance: boolean
): string[] {
    return splitBoxes(entries, count, weightedByVariance).map((box) =>
        rgbToCss(weightedAverageRgb(box))
    )
}

function quantizeOctree(entries: ColorEntry[], count: number): string[] {
    let bits = 7
    let groups = new Map<string, ColorEntry[]>()
    while (bits >= 1) {
        groups = new Map()
        const shift = 8 - bits
        for (const entry of entries) {
            const key = `${entry.rgb.r >> shift},${entry.rgb.g >> shift},${
                entry.rgb.b >> shift
            }`
            const group = groups.get(key) ?? []
            group.push(entry)
            groups.set(key, group)
        }
        if (groups.size <= count) break
        bits--
    }
    return Array.from(groups.values())
        .sort((a, b) => {
            const ca = a.reduce((sum, entry) => sum + entry.count, 0)
            const cb = b.reduce((sum, entry) => sum + entry.count, 0)
            return cb - ca
        })
        .slice(0, count)
        .map((group) => rgbToCss(weightedAverageRgb(group)))
}

export function extractPaletteByStrategy(
    pixels: (string | null)[][],
    targetColors: number,
    options: {
        methodId: PaletteStrategyMethodId
        colorSpaceId: PaletteStrategyColorSpaceId
        excludedColors?: string[]
    }
): PaletteResult {
    const { usable } = collectEntries(
        pixels,
        options.colorSpaceId,
        options.excludedColors
    )
    if (usable.length === 0) return { pixels, palette: [] }

    const count = clamp(targetColors, 1, usable.length)
    const palette =
        usable.length <= count
            ? usable.map((entry) => entry.color)
            : (() => {
                  switch (options.methodId) {
                      case "k-medoids":
                          return quantizeKMedoids(usable, count)
                      case "octree":
                          return quantizeOctree(usable, count)
                      case "median-cut":
                          return quantizeByBoxes(usable, count, false)
                      case "fuzzy-c-means":
                          return quantizeKMeans(
                              usable,
                              count,
                              options.colorSpaceId,
                              true
                          )
                      case "wu-color-quantizer":
                          return quantizeByBoxes(usable, count, true)
                      case "k-means":
                      default:
                          return quantizeKMeans(
                              usable,
                              count,
                              options.colorSpaceId
                          )
                  }
              })()

    return {
        pixels: mapPixelsToPalette(pixels, options.colorSpaceId, palette),
        palette,
    }
}

export function quantizeFixedPaletteByColorSpace(
    pixels: (string | null)[][],
    paletteColors: string[],
    colorSpaceId: PaletteStrategyColorSpaceId
): (string | null)[][] {
    return mapPixelsToPalette(pixels, colorSpaceId, paletteColors)
}
