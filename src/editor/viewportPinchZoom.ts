export type PinchPoint = {
    x: number
    y: number
}

export type PinchZoomInput = {
    startZoom: number
    startPanX: number
    startPanY: number
    startCenter: PinchPoint
    startDistance: number
    currentCenter: PinchPoint
    currentDistance: number
    viewportW: number
    viewportH: number
    minZoom: number
}

export type PinchZoomResult = {
    zoom: number
    panX: number
    panY: number
}

function clampPan(
    panX: number,
    panY: number,
    zoom: number,
    viewportW: number,
    viewportH: number
) {
    const contentW = viewportW * zoom
    const contentH = viewportH * zoom
    const minX = Math.min(0, viewportW - contentW)
    const minY = Math.min(0, viewportH - contentH)

    return {
        panX: Math.round(Math.max(minX, Math.min(0, panX))),
        panY: Math.round(Math.max(minY, Math.min(0, panY))),
    }
}

export function getDistance(a: PinchPoint, b: PinchPoint) {
    return Math.hypot(b.x - a.x, b.y - a.y)
}

export function getCenter(a: PinchPoint, b: PinchPoint): PinchPoint {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
    }
}

export function getPinchZoomUpdate(
    input: PinchZoomInput
): PinchZoomResult | null {
    if (input.viewportW <= 0 || input.viewportH <= 0) return null
    if (input.startDistance <= 0 || input.currentDistance <= 0) return null

    const ratio = input.currentDistance / input.startDistance
    if (!Number.isFinite(ratio) || ratio <= 0) return null

    const nextZoom = Math.max(input.minZoom, input.startZoom * ratio)
    if (nextZoom === input.startZoom) return null

    const contentX = (input.startCenter.x - input.startPanX) / input.startZoom
    const contentY = (input.startCenter.y - input.startPanY) / input.startZoom
    const nextPanX = input.currentCenter.x - contentX * nextZoom
    const nextPanY = input.currentCenter.y - contentY * nextZoom
    const clamped = clampPan(
        nextPanX,
        nextPanY,
        nextZoom,
        input.viewportW,
        input.viewportH
    )

    return {
        zoom: Math.round(nextZoom * 1000) / 1000,
        panX: clamped.panX,
        panY: clamped.panY,
    }
}
