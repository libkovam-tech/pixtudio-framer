export type CanvasLayoutDeviceClass = "mobile" | "desktop"

export type CanvasLayoutRect = {
    x: number
    y: number
    width: number
    height: number
}

export type CanvasLayoutPolicy = {
    deviceClass: CanvasLayoutDeviceClass
    topMenuRegion: CanvasLayoutRect
    canvasRegion: CanvasLayoutRect
    controlsRegion: CanvasLayoutRect
    actualCanvasRect: CanvasLayoutRect
    interactiveRect: CanvasLayoutRect
    contentWidth: number
    contentHeight: number
    fitScale: number
}

export function calculateCanvasLayoutPolicy(params: {
    deviceClass: CanvasLayoutDeviceClass
    viewportWidth: number
    viewportHeight: number
    anchorWidth: number
    topMenuHeight: number
    controlsHeight: number
    columns: number
    rows: number
}): CanvasLayoutPolicy {
    const viewportWidth = positive(params.viewportWidth)
    const viewportHeight = positive(params.viewportHeight)
    const anchorWidth = positive(params.anchorWidth)
    const topMenuHeight = nonNegative(params.topMenuHeight)
    const controlsHeight = nonNegative(params.controlsHeight)
    const columns = positive(params.columns)
    const rows = positive(params.rows)
    const ratio = columns / rows
    const isHorizontal = columns > rows

    let actualCanvasWidth: number
    let actualCanvasHeight: number

    if (isHorizontal && params.deviceClass === "desktop") {
        actualCanvasHeight = anchorWidth
        actualCanvasWidth = anchorWidth * ratio
    } else if (isHorizontal) {
        actualCanvasWidth = anchorWidth
        actualCanvasHeight = anchorWidth / ratio
    } else {
        actualCanvasHeight = anchorWidth
        actualCanvasWidth = anchorWidth * ratio
    }

    actualCanvasWidth = Math.max(1, actualCanvasWidth)
    actualCanvasHeight = Math.max(1, actualCanvasHeight)

    const contentWidth = Math.max(anchorWidth, actualCanvasWidth)
    const topMenuRegion = rect(
        (contentWidth - anchorWidth) / 2,
        0,
        anchorWidth,
        topMenuHeight
    )
    const canvasRegion = rect(
        (contentWidth - anchorWidth) / 2,
        topMenuRegion.y + topMenuRegion.height,
        anchorWidth,
        actualCanvasHeight
    )
    const actualCanvasRect = rect(
        (contentWidth - actualCanvasWidth) / 2,
        canvasRegion.y,
        actualCanvasWidth,
        actualCanvasHeight
    )
    const controlsRegion = rect(
        (contentWidth - anchorWidth) / 2,
        canvasRegion.y + canvasRegion.height,
        anchorWidth,
        controlsHeight
    )
    const contentHeight =
        topMenuRegion.height + canvasRegion.height + controlsRegion.height
    const fitScale = Math.min(
        1,
        viewportWidth / Math.max(1, contentWidth),
        viewportHeight / Math.max(1, contentHeight)
    )

    return {
        deviceClass: params.deviceClass,
        topMenuRegion,
        canvasRegion,
        controlsRegion,
        actualCanvasRect,
        interactiveRect: actualCanvasRect,
        contentWidth,
        contentHeight,
        fitScale,
    }
}

function rect(
    x: number,
    y: number,
    width: number,
    height: number
): CanvasLayoutRect {
    return {
        x: roundLayoutNumber(x),
        y: roundLayoutNumber(y),
        width: roundLayoutNumber(width),
        height: roundLayoutNumber(height),
    }
}

function positive(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 1
    return value
}

function nonNegative(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return 0
    return value
}

function roundLayoutNumber(value: number): number {
    return Math.round(value * 1000) / 1000
}
