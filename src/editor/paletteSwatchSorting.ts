export type PaletteSortableSwatch = {
    id: string
    color?: string | null
    isTransparent?: boolean
}

type SwatchColorGroup = "red" | "green" | "blue" | "gray"

type SwatchColorClass = {
    group: SwatchColorGroup
    keyInsideGroup: number
    h: number
    s: number
    v: number
    isTransparent: boolean
}

const groupOrder: Record<SwatchColorGroup, number> = {
    red: 0,
    green: 1,
    blue: 2,
    gray: 3,
}

function componentToHex(c: number) {
    const hex = c.toString(16)
    return hex.length === 1 ? "0" + hex : hex
}

function parseRGB(color: string) {
    const m = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(color)
    if (!m) return { r: 0, g: 0, b: 0 }
    return {
        r: parseInt(m[1], 10),
        g: parseInt(m[2], 10),
        b: parseInt(m[3], 10),
    }
}

function hslToRgb(h: number, s: number, l: number) {
    h = ((h % 360) + 360) % 360
    s /= 100
    l /= 100

    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2

    let r1 = 0
    let g1 = 0
    let b1 = 0
    if (h < 60) {
        r1 = c
        g1 = x
    } else if (h < 120) {
        r1 = x
        g1 = c
    } else if (h < 180) {
        g1 = c
        b1 = x
    } else if (h < 240) {
        g1 = x
        b1 = c
    } else if (h < 300) {
        r1 = x
        b1 = c
    } else {
        r1 = c
        b1 = x
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    }
}

function parseHSL(color: string) {
    const m = /hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/.exec(color)
    if (!m) return { h: 0, s: 0, l: 0 }
    return {
        h: parseInt(m[1], 10),
        s: parseInt(m[2], 10),
        l: parseInt(m[3], 10),
    }
}

function cssColorToHex(color: string | null | undefined) {
    if (!color) return "#ff0000"

    if (color.startsWith("#")) {
        if (color.length === 7) return color
        if (color.length === 4) {
            const r = color[1]
            const g = color[2]
            const b = color[3]
            return "#" + r + r + g + g + b + b
        }
        return "#ff0000"
    }

    if (color.startsWith("rgb")) {
        const { r, g, b } = parseRGB(color)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    if (color.startsWith("hsl")) {
        const { h, s, l } = parseHSL(color)
        const { r, g, b } = hslToRgb(h, s, l)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    return "#ff0000"
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const value = hex.trim().replace("#", "")
    if (!/^[0-9a-fA-F]{6}$/.test(value)) return null

    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    }
}

function rgbToHsv(r: number, g: number, b: number) {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min

    let h = 0
    if (d !== 0) {
        switch (max) {
            case r:
                h = ((g - b) / d) % 6
                break
            case g:
                h = (b - r) / d + 2
                break
            case b:
                h = (r - g) / d + 4
                break
        }
        h *= 60
        if (h < 0) h += 360
    }
    const s = max === 0 ? 0 : d / max
    const v = max
    return { h, s, v }
}

export function classifySwatchColor(
    swatch: PaletteSortableSwatch
): SwatchColorClass {
    const isTransparent = !!swatch.isTransparent

    if (isTransparent || !swatch.color) {
        return {
            group: "gray",
            keyInsideGroup: Number.POSITIVE_INFINITY,
            h: 0,
            s: 0,
            v: 0,
            isTransparent,
        }
    }

    const hex = cssColorToHex(swatch.color)
    const rgb = hexToRgb(hex)

    if (!rgb) {
        return {
            group: "gray",
            keyInsideGroup: Number.POSITIVE_INFINITY,
            h: 0,
            s: 0,
            v: 0,
            isTransparent: false,
        }
    }

    const { h, s, v } = rgbToHsv(rgb.r, rgb.g, rgb.b)

    if (s < 0.08) {
        return {
            group: "gray",
            keyInsideGroup: v,
            h,
            s,
            v,
            isTransparent: false,
        }
    }

    let group: SwatchColorGroup = "blue"
    if (h < 60 || h >= 300) group = "red"
    else if (h < 180) group = "green"

    const hueAdjusted = group === "red" && h >= 300 ? h - 360 : h

    return {
        group,
        keyInsideGroup: hueAdjusted,
        h: hueAdjusted,
        s,
        v,
        isTransparent: false,
    }
}

export function sortSwatchesForUI<T extends PaletteSortableSwatch>(
    source: ReadonlyArray<T>
): T[] {
    const arr = [...source]
    const clsById = new Map<string, SwatchColorClass>()
    for (const sw of arr) clsById.set(sw.id, classifySwatchColor(sw))

    const stableId = (id: unknown) => String(id ?? "")

    arr.sort((a, b) => {
        const ca = clsById.get(a.id) ?? classifySwatchColor(a)
        const cb = clsById.get(b.id) ?? classifySwatchColor(b)

        const ga = groupOrder[ca.group]
        const gb = groupOrder[cb.group]
        if (ga !== gb) return ga - gb

        if (ca.keyInsideGroup !== cb.keyInsideGroup) {
            return ca.keyInsideGroup - cb.keyInsideGroup
        }

        if (ca.s !== cb.s) return ca.s - cb.s

        const ida = stableId(a.id)
        const idb = stableId(b.id)
        if (ida < idb) return -1
        if (ida > idb) return 1
        return 0
    })

    return arr
}
