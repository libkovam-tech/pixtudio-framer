import { describe, expect, it } from "vitest"

import {
    type SpaceHandState,
    startSpaceHandTool,
    stopSpaceHandTool,
} from "./spaceHandTool.ts"

describe("space hand tool", () => {
    const base: SpaceHandState = {
        isHolding: false,
        previousTool: "brush",
        activeTool: "brush",
    }

    it("switches to hand while Space is held inside the desktop canvas", () => {
        expect(
            startSpaceHandTool(base, {
                enabled: true,
                isMobileUI: false,
                pointerInside: true,
                key: " ",
                repeat: false,
            })
        ).toEqual({
            isHolding: true,
            previousTool: "brush",
            activeTool: "hand",
        })
    })

    it("ignores mobile and outside-canvas key presses", () => {
        expect(
            startSpaceHandTool(base, {
                enabled: true,
                isMobileUI: true,
                pointerInside: true,
                key: " ",
                repeat: false,
            })
        ).toEqual(base)

        expect(
            startSpaceHandTool(base, {
                enabled: true,
                isMobileUI: false,
                pointerInside: false,
                key: " ",
                repeat: false,
            })
        ).toEqual(base)
    })

    it("returns to the default brush on Space release", () => {
        expect(
            stopSpaceHandTool(
                {
                    isHolding: true,
                    previousTool: "pipette",
                    activeTool: "hand",
                },
                { key: " " }
            )
        ).toEqual({
            isHolding: false,
            previousTool: "pipette",
            activeTool: "brush",
        })
    })
})
