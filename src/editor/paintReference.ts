export type PaintReferencePixelValue = string | null

export type PaintReferenceSwatch = {
    id: string
    color: string | null
    isTransparent?: boolean | null
    isUser?: boolean | null
}

export type PaintReferenceCanvasContextProvider = (
    canvas: HTMLCanvasElement
) => CanvasRenderingContext2D | null

export type PaintReferencePixelizeSnapshot = (
    snapshot: ImageData,
    gridSize: number
) => (string | null)[][]

export type PaintReferenceFixedPaletteQuantizer = (
    pixels: (string | null)[][],
    paletteHex: string[]
) => (string | null)[][]

export function createEmptyPaintReferencePixels<TPixel extends string | null>(
    size: number
): TPixel[][] {
    return Array.from({ length: size }, () =>
        Array.from({ length: size }, () => null as TPixel)
    )
}

export function buildPaintReferenceSwatchByIdMap<
    TSwatch extends PaintReferenceSwatch,
>(autoSwatches: ReadonlyArray<TSwatch>, userSwatches: ReadonlyArray<TSwatch>) {
    const swatchById = new Map<string, TSwatch>()
    for (const swatch of autoSwatches) swatchById.set(swatch.id, swatch)
    for (const swatch of userSwatches) swatchById.set(swatch.id, swatch)
    return swatchById
}

function preparePaintReferenceCanvas(params: {
    canvasSize: number
    getCanvas: () => HTMLCanvasElement
    get2dContext: PaintReferenceCanvasContextProvider
}): {
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D | null
} {
    const canvas = params.getCanvas()
    canvas.width = params.canvasSize
    canvas.height = params.canvasSize

    return {
        canvas,
        context: params.get2dContext(canvas),
    }
}

export function renderPaintGridToImageData<
    TPixel extends string | null,
    TSwatch extends PaintReferenceSwatch,
>(params: {
    paintGrid: TPixel[][]
    autoSwatches: ReadonlyArray<TSwatch>
    userSwatches: ReadonlyArray<TSwatch>
    canvasSize: number
    transparentPixel: string
    getCanvas: () => HTMLCanvasElement
    get2dContext: PaintReferenceCanvasContextProvider
}): ImageData {
    const { paintGrid, autoSwatches, userSwatches, canvasSize } = params

    const rows = paintGrid?.length ?? 0
    const cols = rows > 0 ? (paintGrid[0]?.length ?? 0) : 0
    const { context } = preparePaintReferenceCanvas(params)
    if (!context) {
        return new ImageData(canvasSize, canvasSize)
    }

    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvasSize, canvasSize)

    if (rows <= 0 || cols <= 0) {
        return context.getImageData(0, 0, canvasSize, canvasSize)
    }

    const swatchById = buildPaintReferenceSwatchByIdMap(
        autoSwatches,
        userSwatches
    )

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        const y0 = Math.floor((rowIndex * canvasSize) / rows)
        const y1 = Math.floor(((rowIndex + 1) * canvasSize) / rows)
        const row = paintGrid[rowIndex] || []

        for (let column = 0; column < cols; column++) {
            const x0 = Math.floor((column * canvasSize) / cols)
            const x1 = Math.floor(((column + 1) * canvasSize) / cols)
            const value = (row[column] ?? null) as TPixel

            // Null and the transparent tool remain transparent in the reference.
            if (value === null) continue
            if (value === params.transparentPixel) continue

            const swatch = swatchById.get(value)
            if (!swatch || swatch.isTransparent) continue

            context.fillStyle = swatch.color || "#000000"
            context.fillRect(
                x0,
                y0,
                Math.max(1, x1 - x0),
                Math.max(1, y1 - y0)
            )
        }
    }

    return context.getImageData(0, 0, canvasSize, canvasSize)
}

export function transparentMaskHexForIndex(index: number): string {
    const code = Math.max(1, index + 1)
    const r = (code & 0x0f) * 16
    const g = ((code >> 4) & 0x0f) * 16
    const b = ((code >> 8) & 0x0f) * 16
    const toHex = (value: number) =>
        value.toString(16).toUpperCase().padStart(2, "0")
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function renderTransparentPaintGridToImageData<
    TPixel extends string | null,
    TSwatch extends PaintReferenceSwatch,
>(params: {
    paintGrid: TPixel[][]
    autoSwatches: ReadonlyArray<TSwatch>
    userSwatches: ReadonlyArray<TSwatch>
    canvasSize: number
    transparentPixel: string
    getCanvas: () => HTMLCanvasElement
    get2dContext: PaintReferenceCanvasContextProvider
}): {
    imageData: ImageData
    valueByHex: Map<string, TPixel>
    count: number
} {
    const { paintGrid, autoSwatches, userSwatches, canvasSize } = params

    const rows = paintGrid?.length ?? 0
    const cols = rows > 0 ? (paintGrid[0]?.length ?? 0) : 0
    const { context } = preparePaintReferenceCanvas(params)
    if (!context) {
        return {
            imageData: new ImageData(canvasSize, canvasSize),
            valueByHex: new Map(),
            count: 0,
        }
    }

    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvasSize, canvasSize)

    const swatchById = buildPaintReferenceSwatchByIdMap(
        autoSwatches,
        userSwatches
    )
    const hexByValue = new Map<TPixel, string>()
    const valueByHex = new Map<string, TPixel>()
    let count = 0

    const getMaskHex = (value: TPixel) => {
        const existing = hexByValue.get(value)
        if (existing) return existing

        const hex = transparentMaskHexForIndex(hexByValue.size)
        hexByValue.set(value, hex)
        valueByHex.set(hex, value)
        return hex
    }

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        const y0 = Math.floor((rowIndex * canvasSize) / rows)
        const y1 = Math.floor(((rowIndex + 1) * canvasSize) / rows) || y0 + 1
        const row = paintGrid[rowIndex] || []

        for (let column = 0; column < cols; column++) {
            const x0 = Math.floor((column * canvasSize) / cols)
            const x1 = Math.floor(((column + 1) * canvasSize) / cols) || x0 + 1
            const value = (row[column] ?? null) as TPixel

            if (value == null) continue

            const isTransparentTool = value === params.transparentPixel
            const isTransparentSwatch =
                typeof value === "string" &&
                !!swatchById.get(value)?.isTransparent
            if (!isTransparentTool && !isTransparentSwatch) continue

            context.fillStyle = getMaskHex(value)
            context.fillRect(
                x0,
                y0,
                Math.max(1, x1 - x0),
                Math.max(1, y1 - y0)
            )
            count++
        }
    }

    return {
        imageData: context.getImageData(0, 0, canvasSize, canvasSize),
        valueByHex,
        count,
    }
}

export function renderUserPaintGridToImageData<
    TPixel extends string | null,
    TSwatch extends PaintReferenceSwatch,
>(params: {
    paintGrid: TPixel[][]
    autoSwatches: ReadonlyArray<TSwatch>
    userSwatches: ReadonlyArray<TSwatch>
    canvasSize: number
    transparentPixel: string
    getCanvas: () => HTMLCanvasElement
    get2dContext: PaintReferenceCanvasContextProvider
}): {
    imageData: ImageData
    valueByHex: Map<string, TPixel>
    count: number
} {
    const { paintGrid, userSwatches, canvasSize } = params

    const rows = paintGrid?.length ?? 0
    const cols = rows > 0 ? (paintGrid[0]?.length ?? 0) : 0
    const { context } = preparePaintReferenceCanvas(params)
    if (!context) {
        return {
            imageData: new ImageData(canvasSize, canvasSize),
            valueByHex: new Map(),
            count: 0,
        }
    }

    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, canvasSize, canvasSize)

    const userSwatchIds = new Set(
        userSwatches
            .filter((swatch) => swatch && !swatch.isTransparent)
            .map((swatch) => swatch.id)
    )
    const hexByValue = new Map<TPixel, string>()
    const valueByHex = new Map<string, TPixel>()
    let count = 0

    const getMaskHex = (value: TPixel) => {
        const existing = hexByValue.get(value)
        if (existing) return existing

        const hex = transparentMaskHexForIndex(hexByValue.size)
        hexByValue.set(value, hex)
        valueByHex.set(hex, value)
        return hex
    }

    for (let rowIndex = 0; rowIndex < rows; rowIndex++) {
        const y0 = Math.floor((rowIndex * canvasSize) / rows)
        const y1 = Math.floor(((rowIndex + 1) * canvasSize) / rows) || y0 + 1
        const row = paintGrid[rowIndex] || []

        for (let column = 0; column < cols; column++) {
            const x0 = Math.floor((column * canvasSize) / cols)
            const x1 = Math.floor(((column + 1) * canvasSize) / cols) || x0 + 1
            const value = (row[column] ?? null) as TPixel

            if (value == null) continue
            if (value === params.transparentPixel) continue
            if (!userSwatchIds.has(String(value))) continue

            context.fillStyle = getMaskHex(value)
            context.fillRect(
                x0,
                y0,
                Math.max(1, x1 - x0),
                Math.max(1, y1 - y0)
            )
            count++
        }
    }

    return {
        imageData: context.getImageData(0, 0, canvasSize, canvasSize),
        valueByHex,
        count,
    }
}

function componentToHex(component: number) {
    const hex = component.toString(16)
    return hex.length === 1 ? "0" + hex : hex
}

function parseRgbColor(color: string) {
    const match = /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(color)
    if (!match) return { r: 0, g: 0, b: 0 }
    return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
    }
}

function parseHslColor(color: string) {
    const match = /hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/.exec(color)
    if (!match) return { h: 0, s: 0, l: 0 }
    return {
        h: parseInt(match[1], 10),
        s: parseInt(match[2], 10),
        l: parseInt(match[3], 10),
    }
}

function hslToRgb(h: number, s: number, l: number) {
    h = ((h % 360) + 360) % 360
    s /= 100
    l /= 100

    const chroma = (1 - Math.abs(2 * l - 1)) * s
    const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - chroma / 2

    let r1 = 0
    let g1 = 0
    let b1 = 0
    if (h < 60) {
        r1 = chroma
        g1 = x
    } else if (h < 120) {
        r1 = x
        g1 = chroma
    } else if (h < 180) {
        g1 = chroma
        b1 = x
    } else if (h < 240) {
        g1 = x
        b1 = chroma
    } else if (h < 300) {
        r1 = x
        b1 = chroma
    } else {
        r1 = chroma
        b1 = x
    }

    return {
        r: Math.round((r1 + m) * 255),
        g: Math.round((g1 + m) * 255),
        b: Math.round((b1 + m) * 255),
    }
}

function cssColorToHex(color: string | null) {
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
        const { r, g, b } = parseRgbColor(color)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    if (color.startsWith("hsl")) {
        const { h, s, l } = parseHslColor(color)
        const { r, g, b } = hslToRgb(h, s, l)
        return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b)
    }

    return "#ff0000"
}

export function toHexUpperOrNull(css: string | null): string | null {
    if (!css) return null
    const hex = (cssColorToHex(css) || "").toUpperCase()
    return hex || null
}

export function requantizeTransparentPaintSnapshotToOverlayPixels<
    TPixel extends string | null,
>(params: {
    snapshot: ImageData
    gridSize: number
    valueByHex: ReadonlyMap<string, TPixel>
    pixelizeSnapshot: PaintReferencePixelizeSnapshot
}): TPixel[][] {
    const maskPixels = params.pixelizeSnapshot(params.snapshot, params.gridSize)
    const out = createEmptyPaintReferencePixels<TPixel>(params.gridSize)

    for (let row = 0; row < params.gridSize; row++) {
        const sourceRow = maskPixels[row] || []
        const outRow = out[row]
        for (let column = 0; column < params.gridSize; column++) {
            const hex = toHexUpperOrNull(sourceRow[column] ?? null)
            outRow[column] = hex
                ? (params.valueByHex.get(hex) ?? (null as TPixel))
                : (null as TPixel)
        }
    }

    return out
}

export function overlayTransparentSnapshotOverColor<
    TPixel extends string | null,
>(params: {
    colorOverlay: TPixel[][]
    transparentOverlay: TPixel[][]
}): TPixel[][] {
    let changed = false
    const out = params.colorOverlay.map((row) => row.slice())

    for (let row = 0; row < out.length; row++) {
        const transparentRow = params.transparentOverlay[row] || []
        const outRow = out[row]
        for (let column = 0; column < outRow.length; column++) {
            const transparentValue = transparentRow[column] ?? null
            if (transparentValue == null) continue
            if (outRow[column] !== transparentValue) {
                outRow[column] = transparentValue
                changed = true
            }
        }
    }

    return changed ? out : params.colorOverlay
}

export function buildFixedPaletteHexAndIdMap<
    TSwatch extends PaintReferenceSwatch,
>(params: {
    baseAuto: ReadonlyArray<TSwatch>
    user: ReadonlyArray<TSwatch>
}): { paletteHex: string[]; idByHex: Map<string, string> } {
    const { baseAuto, user } = params

    const paletteHex: string[] = []
    const idByHex = new Map<string, string>()

    const add = (swatch: TSwatch) => {
        if (swatch.isTransparent) return
        const hex = toHexUpperOrNull(swatch.color)
        if (!hex) return
        // Preserve order while collapsing duplicate hex colors.
        if (!idByHex.has(hex)) {
            paletteHex.push(hex)
            idByHex.set(hex, swatch.id)
        }
    }

    for (const swatch of baseAuto) add(swatch)
    for (const swatch of user) add(swatch)

    return { paletteHex, idByHex }
}

export function requantizePaintSnapshotToOverlayPixels<
    TPixel extends string | null,
    TSwatch extends PaintReferenceSwatch,
>(params: {
    snapshot: ImageData
    gridSize: number
    baseAuto: ReadonlyArray<TSwatch>
    user: ReadonlyArray<TSwatch>
    pixelizeSnapshot: PaintReferencePixelizeSnapshot
    quantizeToFixedPalette: PaintReferenceFixedPaletteQuantizer
}): TPixel[][] {
    const { snapshot, gridSize, baseAuto, user } = params

    const snapshotPixels = params.pixelizeSnapshot(snapshot, gridSize)
    const { paletteHex, idByHex } = buildFixedPaletteHexAndIdMap({
        baseAuto,
        user,
    })

    if (paletteHex.length === 0) {
        return createEmptyPaintReferencePixels<TPixel>(gridSize)
    }

    const quantized = params.quantizeToFixedPalette(snapshotPixels, paletteHex)
    const out = createEmptyPaintReferencePixels<TPixel>(gridSize)

    for (let row = 0; row < gridSize; row++) {
        const sourceRow = quantized[row] || []
        const outRow = out[row]
        for (let column = 0; column < gridSize; column++) {
            const color = sourceRow[column] ?? null
            if (color == null) {
                outRow[column] = null as TPixel
                continue
            }

            const hex = toHexUpperOrNull(color)
            if (!hex) {
                outRow[column] = null as TPixel
                continue
            }
            const id = idByHex.get(hex)
            outRow[column] = (id ?? "auto-0") as TPixel
        }
    }

    return out
}

export function requantizePaintRefsToOverlayPixels<
    TPixel extends string | null,
    TSwatch extends PaintReferenceSwatch,
>(params: {
    colorSnapshot: ImageData | null
    userSnapshot: ImageData | null
    userValueByHex: ReadonlyMap<string, TPixel>
    transparentSnapshot: ImageData | null
    transparentValueByHex: ReadonlyMap<string, TPixel>
    gridSize: number
    baseAuto: ReadonlyArray<TSwatch>
    user: ReadonlyArray<TSwatch>
    pixelizeSnapshot: PaintReferencePixelizeSnapshot
    quantizeToFixedPalette: PaintReferenceFixedPaletteQuantizer
}): TPixel[][] {
    const colorOverlay = params.colorSnapshot
        ? requantizePaintSnapshotToOverlayPixels<TPixel, TSwatch>({
              snapshot: params.colorSnapshot,
              gridSize: params.gridSize,
              baseAuto: params.baseAuto,
              user: params.user,
              pixelizeSnapshot: params.pixelizeSnapshot,
              quantizeToFixedPalette: params.quantizeToFixedPalette,
          })
        : createEmptyPaintReferencePixels<TPixel>(params.gridSize)

    const userOverlay = params.userSnapshot
        ? requantizeTransparentPaintSnapshotToOverlayPixels<TPixel>({
              snapshot: params.userSnapshot,
              gridSize: params.gridSize,
              valueByHex: params.userValueByHex,
              pixelizeSnapshot: params.pixelizeSnapshot,
          })
        : null

    const colorWithExactUserOverlay = userOverlay
        ? overlayTransparentSnapshotOverColor({
              colorOverlay,
              transparentOverlay: userOverlay,
          })
        : colorOverlay

    if (!params.transparentSnapshot) return colorWithExactUserOverlay

    const transparentOverlay =
        requantizeTransparentPaintSnapshotToOverlayPixels<TPixel>({
            snapshot: params.transparentSnapshot,
            gridSize: params.gridSize,
            valueByHex: params.transparentValueByHex,
            pixelizeSnapshot: params.pixelizeSnapshot,
        })

    return overlayTransparentSnapshotOverColor({
        colorOverlay: colorWithExactUserOverlay,
        transparentOverlay,
    })
}
