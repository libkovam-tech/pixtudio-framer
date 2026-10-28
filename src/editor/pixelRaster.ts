import type { ImageDataSampleSource } from "./editorHistoryState.ts"

const CANVAS_SIZE = 512
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function pixelizeFromImageDominant(
    imageData: ImageDataSampleSource,
    gridGeometry: number | { rows: number; columns: number },
    roundStep = 16
) {
    const { width, height, data } = imageData

    const rows =
        typeof gridGeometry === "number" ? gridGeometry : gridGeometry.rows
    const columns =
        typeof gridGeometry === "number" ? gridGeometry : gridGeometry.columns
    const safeRows = Math.max(1, Math.round(rows || 0))
    const safeColumns = Math.max(1, Math.round(columns || 0))
    const result = Array.from({ length: safeRows }, () =>
        Array.from({ length: safeColumns }, () => null as string | null)
    )

    const cellWidth = width / safeColumns
    const cellHeight = height / safeRows
    const roundComponent = (v: number) =>
        clamp(Math.round(v / roundStep) * roundStep, 0, 255)

    const rgbKey = (r: number, g: number, b: number) =>
        ((r & 255) << 16) | ((g & 255) << 8) | (b & 255)

    const keyToRgb = (key: number) => {
        const r = (key >> 16) & 255
        const g = (key >> 8) & 255
        const b = key & 255
        return { r, g, b }
    }

    const pickSmartTie = (keys: number[]) => {
        if (keys.length === 1) return keys[0]
        let bestKey = keys[0]
        let bestLum = Infinity
        for (const k of keys) {
            const { r, g, b } = keyToRgb(k)
            const lum = r * 0.299 + g * 0.587 + b * 0.114
            if (lum < bestLum) {
                bestLum = lum
                bestKey = k
            }
        }
        return bestKey
    }

    for (let gy = 0; gy < safeRows; gy++) {
        const startY = Math.floor(gy * cellHeight)
        const endY = Math.floor((gy + 1) * cellHeight) || startY + 1

        for (let gx = 0; gx < safeColumns; gx++) {
            const startX = Math.floor(gx * cellWidth)
            const endX = Math.floor((gx + 1) * cellWidth) || startX + 1

            const counts = new Map<number, number>()
            for (let y = startY; y < endY; y++) {
                if (y < 0 || y >= height) continue
                for (let x = startX; x < endX; x++) {
                    if (x < 0 || x >= width) continue
                    const idx = (y * width + x) * 4
                    const a = data[idx + 3]
                    if (a === 0) continue
                    const rr = roundComponent(data[idx])
                    const gg = roundComponent(data[idx + 1])
                    const bb = roundComponent(data[idx + 2])

                    const key = rgbKey(rr, gg, bb)
                    counts.set(key, (counts.get(key) || 0) + 1)
                }
            }

            if (counts.size === 0) {
                result[gy][gx] = null
                continue
            }

            let maxCount = -1
            for (const v of counts.values()) if (v > maxCount) maxCount = v
            const topKeys: number[] = []
            for (const [k, v] of counts.entries())
                if (v === maxCount) topKeys.push(k)

            const bestKey = pickSmartTie(topKeys)
            const { r, g, b } = keyToRgb(bestKey)
            result[gy][gx] = "rgb(" + r + ", " + g + ", " + b + ")"
        }
    }

    return result
}

export function computeExportSize(gridSize: number) {
    const target = CANVAS_SIZE
    const down = Math.floor(target / gridSize) * gridSize
    const up = Math.ceil(target / gridSize) * gridSize
    const best = Math.abs(down - target) <= Math.abs(up - target) ? down : up
    return best > 0 ? best : gridSize
}

export function computeRectangularExportGeometry(params: {
    gridSize: number
    columns: number
    rows: number
}) {
    const exportShortSide = computeExportSize(params.gridSize)
    const cellSize = exportShortSide / params.gridSize
    return {
        cellSize,
        width: Math.max(1, Math.round(params.columns * cellSize)),
        height: Math.max(1, Math.round(params.rows * cellSize)),
    }
}

export function renderPixelGridCanvas(input: {
    gridSize: number
    columns: number
    rows: number
    colorAt: (row: number, column: number) => string | null
}): HTMLCanvasElement | null {
    const geometry = computeRectangularExportGeometry(input)
    const canvas = document.createElement("canvas")
    canvas.width = geometry.width
    canvas.height = geometry.height
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, geometry.width, geometry.height)
    for (let row = 0; row < input.rows; row++) {
        for (let column = 0; column < input.columns; column++) {
            const color = input.colorAt(row, column)
            if (!color) continue
            ctx.fillStyle = color
            ctx.fillRect(column * geometry.cellSize, row * geometry.cellSize, geometry.cellSize, geometry.cellSize)
        }
    }
    return canvas
}
