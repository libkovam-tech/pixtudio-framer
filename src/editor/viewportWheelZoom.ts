export type WheelZoomInput = {
    deltaY: number
    zoom: number
    panX: number
    panY: number
    anchorX: number
    anchorY: number
    viewportW: number
    viewportH: number
    minZoom: number
    zoomStep: number
}

export type AnchoredZoomInput = {
    nextZoom: number
    zoom: number
    panX: number
    panY: number
    anchorX: number
    anchorY: number
    viewportW: number
    viewportH: number
    minZoom: number
}

export type WheelZoomResult = {
    zoom: number
    panX: number
    panY: number
}

function quantizeZoomStep(value: number) {
    return Math.round(value * 10) / 10
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

export function getWheelZoomUpdate(
    input: WheelZoomInput
): WheelZoomResult | null {
    if (!Number.isFinite(input.deltaY) || input.deltaY === 0) return null

    const direction = input.deltaY < 0 ? 1 : -1

    return getAnchoredZoomUpdate({
        ...input,
        nextZoom: input.zoom + direction * input.zoomStep,
    })
}

export function getAnchoredZoomUpdate(
    input: AnchoredZoomInput
): WheelZoomResult | null {
    if (input.viewportW <= 0 || input.viewportH <= 0) return null

    const nextZoom = Math.max(input.minZoom, quantizeZoomStep(input.nextZoom))

    if (nextZoom === input.zoom) return null

    const contentX = (input.anchorX - input.panX) / input.zoom
    const contentY = (input.anchorY - input.panY) / input.zoom
    const nextPanX = input.anchorX - contentX * nextZoom
    const nextPanY = input.anchorY - contentY * nextZoom
    const clamped = clampPan(
        nextPanX,
        nextPanY,
        nextZoom,
        input.viewportW,
        input.viewportH
    )

    return {
        zoom: nextZoom,
        panX: clamped.panX,
        panY: clamped.panY,
    }
}
