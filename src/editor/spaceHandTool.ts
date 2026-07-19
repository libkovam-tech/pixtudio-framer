export type ToolMode = "brush" | "hand" | "pipette"

export type SpaceHandState = {
    isHolding: boolean
    previousTool: ToolMode
    activeTool: ToolMode
}

export type SpaceHandTargetInfo = {
    tagName: string
    inputType?: string | null
    isContentEditable?: boolean
}

export type SpaceHandClientPoint = {
    x: number
    y: number
}

export type SpaceHandClientRect = {
    left: number
    right: number
    top: number
    bottom: number
}

const SPACE_HAND_TEXT_INPUT_TYPES = new Set([
    "",
    "date",
    "datetime-local",
    "email",
    "month",
    "number",
    "password",
    "search",
    "tel",
    "text",
    "time",
    "url",
    "week",
])

export function isSpaceHandTextEditingTarget(
    target: SpaceHandTargetInfo | null
): boolean {
    if (!target) return false

    if (target.isContentEditable) return true

    const tagName = target.tagName.toLowerCase()
    if (tagName === "textarea" || tagName === "select") return true
    if (tagName !== "input") return false

    const inputType = (target.inputType ?? "text").toLowerCase()
    return SPACE_HAND_TEXT_INPUT_TYPES.has(inputType)
}

export function isPointInsideSpaceHandRect(
    point: SpaceHandClientPoint | null,
    rect: SpaceHandClientRect | null
): boolean {
    if (!point || !rect) return false

    return (
        point.x >= rect.left &&
        point.x <= rect.right &&
        point.y >= rect.top &&
        point.y <= rect.bottom
    )
}

export function startSpaceHandTool(
    state: SpaceHandState,
    options: {
        enabled: boolean
        isMobileUI: boolean
        pointerInside: boolean
        key: string
        repeat: boolean
    }
): SpaceHandState {
    if (!options.enabled || options.isMobileUI || !options.pointerInside) {
        return state
    }
    if (options.key !== " " && options.key !== "Spacebar") return state
    if (options.repeat || state.isHolding) return state

    return {
        isHolding: true,
        previousTool: state.activeTool,
        activeTool: "hand",
    }
}

export function stopSpaceHandTool(
    state: SpaceHandState,
    options: {
        key: string
    }
): SpaceHandState {
    if (options.key !== " " && options.key !== "Spacebar") return state
    if (!state.isHolding) return state

    return {
        isHolding: false,
        previousTool: state.previousTool,
        activeTool: "brush",
    }
}
