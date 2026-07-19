import { describe, expect, it } from "vitest"

import {
    type SpaceHandState,
    isPointInsideSpaceHandRect,
    isSpaceHandTextEditingTarget,
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

    it("does not treat range inputs as text editing targets", () => {
        expect(
            isSpaceHandTextEditingTarget({
                tagName: "input",
                inputType: "range",
                isContentEditable: false,
            })
        ).toBe(false)

        expect(
            isSpaceHandTextEditingTarget({
                tagName: "input",
                inputType: "text",
                isContentEditable: false,
            })
        ).toBe(true)

        expect(
            isSpaceHandTextEditingTarget({
                tagName: "textarea",
                isContentEditable: false,
            })
        ).toBe(true)
    })

    it("checks shortcut access by the pointer position inside the viewport", () => {
        const rect = {
            left: 10,
            right: 110,
            top: 20,
            bottom: 120,
        }

        expect(isPointInsideSpaceHandRect({ x: 10, y: 20 }, rect)).toBe(true)
        expect(isPointInsideSpaceHandRect({ x: 110, y: 120 }, rect)).toBe(true)
        expect(isPointInsideSpaceHandRect({ x: 9, y: 50 }, rect)).toBe(false)
        expect(isPointInsideSpaceHandRect(null, rect)).toBe(false)
    })
})
