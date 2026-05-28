export type ToolMode = "brush" | "hand" | "pipette"

export type SpaceHandState = {
    isHolding: boolean
    previousTool: ToolMode
    activeTool: ToolMode
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
