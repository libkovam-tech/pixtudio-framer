import type { CSSProperties } from "react"

export const PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE = 50
export const PIXTUDIO_ACTION_BUTTON_VISIBLE_GAP = 28
export const PIXTUDIO_ACTION_BUTTON_SIDE_MARGIN =
    PIXTUDIO_ACTION_BUTTON_VISIBLE_GAP / 2

const MIN_VIEWPORT_SCALE = 1e-6

function normalizeViewportScale(viewportScale: number | null | undefined): number {
    if (typeof viewportScale !== "number" || !Number.isFinite(viewportScale)) {
        return 1
    }

    return Math.max(MIN_VIEWPORT_SCALE, Math.abs(viewportScale))
}

function numericPx(value: CSSProperties[keyof CSSProperties], fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

export function getViewportCompensationScale(
    viewportScale: number | null | undefined
) {
    return 1 / normalizeViewportScale(viewportScale)
}

export function getViewportCompensatedPx(
    valuePx: number,
    viewportScale: number | null | undefined
) {
    return valuePx * getViewportCompensationScale(viewportScale)
}

export function getViewportCompensatedActionButtonStyle(
    baseStyle: CSSProperties,
    viewportScale: number | null | undefined,
    options: {
        visibleSize?: number
        marginTop?: number
        marginLeft?: number
        marginRight?: number
    } = {}
): CSSProperties {
    const compensationScale = getViewportCompensationScale(viewportScale)
    const visibleSize =
        options.visibleSize ?? PIXTUDIO_ACTION_BUTTON_VISIBLE_SIZE

    return {
        ...baseStyle,
        width: visibleSize * compensationScale,
        height: visibleSize * compensationScale,
        marginTop:
            (options.marginTop ?? numericPx(baseStyle.marginTop, 0)) *
            compensationScale,
        marginLeft:
            (options.marginLeft ?? numericPx(baseStyle.marginLeft, 0)) *
            compensationScale,
        marginRight:
            (options.marginRight ?? numericPx(baseStyle.marginRight, 0)) *
            compensationScale,
    }
}
